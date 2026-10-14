//! Hatchery HD1910 adapter at the official RobotIo seam.
//! Adapted from fanhao375/microduck feetech (8db8f00), Apache-2.0.
//! Native transport comes from kissqy firmware (94328f5), Apache-2.0.
//! Runtime is read-only: no implicit ID, EEPROM, gains, output or policy writes.
//! Uncalibrated encoder references are never published as measured joint radians.
use std::f64::consts::PI;
use std::time::Duration;

use crate::bus_feetech_wire::Bus as FtBus;
use serde::{Deserialize, Serialize};

use crate::imu::ImuData;
use crate::io::{IoError, JointTargets, Result, RobotIo, Sensors, SlowSensors};
use crate::model::{BAUD_RATE, JOINT_IDS, NUM_JOINTS};
const READ_ADDR: u8 = 56;
const READ_LEN: u8 = 15;
const VERSION_ADDR: u8 = 0;
const VERSION_LEN: u8 = 5;
const STEPS_PER_REV: f64 = 4096.0;
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FeetechConfig {
    pub calibrated: bool,
    pub zero_raw: [u16; NUM_JOINTS],
    pub voltage_per_count: Option<f64>,
    pub directions: [f64; NUM_JOINTS],
}

impl Default for FeetechConfig {
    fn default() -> Self {
        Self {
            calibrated: false,
            zero_raw: [2048; NUM_JOINTS],
            voltage_per_count: None,
            directions: [1.0; NUM_JOINTS],
        }
    }
}

pub struct FeetechIo {
    controller: FtBus,
    config: FeetechConfig,
    speed_steps_per_count: f64,
    last_slow: Option<SlowSensors>,
}

impl FeetechIo {
    pub fn open(port: &str, config: FeetechConfig) -> Result<Self> {
        if config.directions.iter().any(|v| ![-1.0, 1.0].contains(v))
            || config.zero_raw.iter().any(|v| *v > 4095)
        {
            return Err(IoError::Bus("invalid FT zero/direction calibration".into()));
        }
        if config
            .voltage_per_count
            .is_some_and(|v| !v.is_finite() || v <= 0.0)
        {
            return Err(IoError::Bus("invalid verified voltage scale".into()));
        }
        Ok(Self {
            controller: open_controller(port, BAUD_RATE)?,
            config,
            speed_steps_per_count: 1.0,
            last_slow: None,
        })
    }
    pub fn check_registers(&mut self) -> Result<usize> {
        // HLS identity/feedback are read explicitly; no STS EEPROM correction.
        for &id in &JOINT_IDS {
            self.controller.read(id, VERSION_ADDR, VERSION_LEN)?;
            self.controller.read(id, READ_ADDR, READ_LEN)?;
        }
        Ok(0)
    }
    pub fn missing_servos(&mut self) -> Result<Vec<u8>> {
        Ok(JOINT_IDS
            .iter()
            .copied()
            .filter(|id| self.controller.ping(*id).is_err())
            .collect())
    }
    pub fn adopt_replacement(&mut self, _id: u8) -> Result<bool> {
        Err(IoError::Bus(
            "automatic FT ID/EEPROM adoption is disabled".into(),
        ))
    }
    pub fn present_positions(&mut self) -> Result<[f64; NUM_JOINTS]> {
        let blocks = self
            .controller
            .sync_read_raw_data(&JOINT_IDS, READ_ADDR, 2)
            .map_err(|e| IoError::Bus(format!("read present positions: {e}")))?;
        if blocks.len() != NUM_JOINTS {
            return Err(IoError::ShortRead {
                what: "present positions",
                expected: NUM_JOINTS,
                got: blocks.len(),
            });
        }
        let mut out = [0.0; NUM_JOINTS];
        for (joint, block) in blocks.iter().enumerate() {
            if block.len() != 2 {
                return Err(IoError::ShortRead {
                    what: "present position",
                    expected: 2,
                    got: block.len(),
                });
            }
            let raw = u16::from_le_bytes([block[0], block[1]]);
            out[joint] = raw_to_rad(
                raw,
                self.config.directions[joint],
                self.config.zero_raw[joint],
            );
        }
        Ok(out)
    }
    pub fn set_torque(&mut self, _on: bool) -> Result<()> {
        Err(IoError::Bus(
            "FT runtime is read-only; use explicit maintenance ownership for bench operations"
                .into(),
        ))
    }
    pub fn interpolate_to(
        &mut self,
        target: &[f64; NUM_JOINTS],
        duration: Duration,
        step: Duration,
    ) -> Result<()> {
        let start = self.present_positions()?;
        let steps = (duration.as_secs_f64() / step.as_secs_f64())
            .ceil()
            .max(1.0) as u32;
        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            let mut next = [0.0; NUM_JOINTS];
            for j in 0..NUM_JOINTS {
                next[j] = start[j] + (target[j] - start[j]) * t;
            }
            self.write(&JointTargets::new(next))?;
            std::thread::sleep(step);
        }
        Ok(())
    }
}
fn open_controller(port: &str, _baud: u32) -> Result<FtBus> {
    FtBus::open_read_only(port)
}
fn sign_magnitude(raw: u16) -> i32 {
    let magnitude = i32::from(raw & 0x7FFF);
    if raw & 0x8000 != 0 {
        -magnitude
    } else {
        magnitude
    }
}
fn raw_to_rad(raw: u16, direction: f64, zero: u16) -> f64 {
    let centred = f64::from(sign_magnitude(raw)) - f64::from(zero);
    direction * centred * (2.0 * PI / STEPS_PER_REV)
}
struct Feedback {
    position: f64,
    velocity: f64,
    current_ma: f64,
    volts: f64,
    temp_c: f64,
}

fn decode_block(
    block: &[u8],
    direction: f64,
    zero: u16,
    voltage_scale: Option<f64>,
    speed_steps_per_count: f64,
) -> Feedback {
    let position = u16::from_le_bytes([block[0], block[1]]);
    let speed = u16::from_le_bytes([block[2], block[3]]);
    Feedback {
        position: raw_to_rad(position, direction, zero),
        velocity: direction
            * f64::from(sign_magnitude(speed))
            * speed_steps_per_count
            * (2.0 * PI / STEPS_PER_REV),
        current_ma: 0.0,
        volts: f64::from(block[6]) * voltage_scale.unwrap_or(0.0),
        temp_c: f64::from(block[7]),
    }
}

impl RobotIo for FeetechIo {
    fn measures_position(&self) -> bool {
        self.config.calibrated
    }
    fn measures_velocity(&self) -> bool {
        false
    }
    fn measures_load(&self) -> bool {
        false
    }

    fn read(&mut self) -> Result<Sensors> {
        let blocks = self
            .controller
            .sync_read_raw_data(&JOINT_IDS, READ_ADDR, READ_LEN)
            .map_err(|e| IoError::Bus(format!("motor sync_read: {e}")))?;
        if blocks.len() != NUM_JOINTS {
            return Err(IoError::ShortRead {
                what: "sync_read blocks",
                expected: NUM_JOINTS,
                got: blocks.len(),
            });
        }

        let mut sensors = Sensors {
            imu: ImuData::default(),
            ..Sensors::default()
        };
        let mut temps_c = [0.0; NUM_JOINTS];
        let mut volts = Vec::with_capacity(NUM_JOINTS);
        for (joint, block) in blocks.iter().enumerate() {
            if block.len() != READ_LEN as usize {
                return Err(IoError::ShortRead {
                    what: "motor block",
                    expected: READ_LEN as usize,
                    got: block.len(),
                });
            }
            let fb = decode_block(
                block,
                self.config.directions[joint],
                self.config.zero_raw[joint],
                self.config.voltage_per_count,
                self.speed_steps_per_count,
            );
            sensors.positions[joint] = fb.position;
            sensors.velocities[joint] = fb.velocity;
            sensors.currents_ma[joint] = fb.current_ma;
            temps_c[joint] = fb.temp_c;
            // A servo answering 0 V is answering nonsense; it must not drag the mean down as if
            // the pack were half flat.
            if fb.volts > 0.0 {
                volts.push(fb.volts);
            }
        }
        if !volts.is_empty() {
            self.last_slow = Some(SlowSensors {
                volts: volts.iter().sum::<f64>() / volts.len() as f64,
                temps_c,
            });
        }
        Ok(sensors)
    }

    fn write(&mut self, _targets: &JointTargets) -> Result<()> {
        Err(IoError::Bus("read-only FT runtime: targets refused".into()))
    }

    fn set_torque(&mut self, on: bool) -> Result<()> {
        FeetechIo::set_torque(self, on)
    }

    fn reboot(&mut self, _id: u8) -> Result<()> {
        Err(IoError::Bus(
            "FT reboot is not enabled in the camera/servo bring-up".into(),
        ))
    }

    fn set_gain(&mut self, _kp: u16) -> Result<()> {
        Err(IoError::Bus(
            "HD1910 gain semantics are not verified; no EEPROM/RAM gain writes".into(),
        ))
    }
    fn slow_sensors(&mut self) -> Result<SlowSensors> {
        if self.last_slow.is_none() {
            self.read()?;
        }
        self.last_slow.ok_or(IoError::ShortRead {
            what: "input voltage",
            expected: NUM_JOINTS,
            got: 0,
        })
    }
    fn imu_ready(&self) -> bool {
        false
    }
}

//! FT packet boundary. Bounded FD bench RAM operations and explicit ID / lock writes.
//! Provenance: docs/FT_READ_ONLY_SOURCE.md and the local FD1985 configuration.
use std::io::{self, Read, Write};
use std::time::{Duration, Instant};

#[derive(Debug)]
pub enum BusError {
    Timeout,
    Invalid(String),
    Transport(io::Error),
}
impl std::fmt::Display for BusError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Timeout => write!(f, "response timeout"),
            Self::Invalid(s) => write!(f, "{s}"),
            Self::Transport(e) => write!(f, "{e}"),
        }
    }
}

pub struct MaintenanceBus {
    port: Box<dyn serialport::SerialPort>,
    timeout: Duration,
}
impl MaintenanceBus {
    pub fn open(path: &str, baud: u32, timeout: Duration) -> Result<Self, String> {
        let builder = serialport::new(path, baud)
            .timeout(timeout)
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .flow_control(serialport::FlowControl::None);
        #[cfg(unix)]
        let port: Box<dyn serialport::SerialPort> = {
            let mut p = builder.open_native().map_err(|e| e.to_string())?;
            p.set_exclusive(true).map_err(|e| e.to_string())?;
            Box::new(p)
        };
        #[cfg(windows)]
        let port = builder.open().map_err(|e| e.to_string())?;
        Ok(Self { port, timeout })
    }
    pub fn ping(&mut self, id: u8) -> Result<(u8, Vec<u8>), BusError> {
        self.transact(id, 1, &[], 0)
    }
    /// Only the frozen reference feedback window is readable. No arbitrary access.
    pub fn reference_feedback(&mut self, id: u8) -> Result<(u8, Vec<u8>), BusError> {
        self.transact(id, 2, &[56, 15], 15)
    }
    pub fn read_registers(
        &mut self,
        id: u8,
        address: u8,
        length: u8,
    ) -> Result<(u8, Vec<u8>), BusError> {
        self.transact(id, 2, &[address, length], usize::from(length))
    }
    /// Bounded SRAM operations. Persistent identity uses the separate identity method.
    pub fn write_bench_ram(
        &mut self,
        id: u8,
        address: u8,
        data: &[u8],
    ) -> Result<(u8, Vec<u8>), BusError> {
        let mut params = vec![address];
        params.extend_from_slice(data);
        self.transact(id, 3, &params, 0)
    }
    /// FD reference identity transaction only; no general EEPROM write entry.
    pub fn write_identity(
        &mut self,
        id: u8,
        address: u8,
        value: u8,
    ) -> Result<(u8, Vec<u8>), BusError> {
        if !((address == 5 && value <= 253) || (address == 55 && value <= 1)) {
            return Err(BusError::Invalid(
                "Identity transaction only accepts ID / lock registers".into(),
            ));
        }
        self.transact(id, 3, &[address, value], 0)
    }
    fn transact(
        &mut self,
        id: u8,
        opcode: u8,
        params: &[u8],
        expected: usize,
    ) -> Result<(u8, Vec<u8>), BusError> {
        let packet = packet(id, opcode, params)?;
        self.port
            .clear(serialport::ClearBuffer::Input)
            .map_err(|e| BusError::Transport(e.into()))?;
        self.port.write_all(&packet).map_err(BusError::Transport)?;
        read_status(&mut self.port, id, expected, self.timeout)
    }
}

fn packet(id: u8, opcode: u8, params: &[u8]) -> Result<Vec<u8>, BusError> {
    let read = opcode == 2
        && params.len() == 2
        && (1..=32).contains(&params[1])
        && u16::from(params[0]) + u16::from(params[1]) <= 256;
    let write = opcode == 3
        && match params {
            [5, value] => *value <= 253,
            [55, value] => *value <= 1,
            [40, value] => *value <= 1,
            [41, value] => (1..=50).contains(value),
            [42, lo, hi] => u16::from_le_bytes([*lo, *hi]) <= 4095,
            [46, lo, hi] => (1..=200).contains(&u16::from_le_bytes([*lo, *hi])),
            _ => false,
        };
    if id > 253 || !((opcode == 1 && params.is_empty()) || read || write) {
        return Err(BusError::Invalid(
            "instruction outside bounded FT maintenance subset".into(),
        ));
    }
    let mut bytes = vec![255, 255, id, (params.len() + 2) as u8, opcode];
    bytes.extend_from_slice(params);
    let checksum = !bytes[2..].iter().fold(0u8, |a, b| a.wrapping_add(*b));
    bytes.push(checksum);
    Ok(bytes)
}

fn read_status(
    reader: &mut impl Read,
    id: u8,
    expected: usize,
    timeout: Duration,
) -> Result<(u8, Vec<u8>), BusError> {
    let deadline = Instant::now() + timeout;
    let mut frame = Vec::new();
    let mut header = false;
    let mut previous = 0;
    while Instant::now() < deadline {
        let mut b = [0u8];
        match reader.read(&mut b) {
            Ok(0) => {
                return Err(BusError::Transport(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "serial closed",
                )));
            }
            Ok(_) => {}
            Err(e)
                if matches!(
                    e.kind(),
                    io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock
                ) =>
            {
                return Err(BusError::Timeout);
            }
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(BusError::Transport(e)),
        }
        if !header {
            if previous == 255 && b[0] == 255 {
                frame.extend_from_slice(&[255, 255]);
                header = true;
            }
            previous = b[0];
            continue;
        }
        frame.push(b[0]);
        if frame.len() == 4 && usize::from(frame[3]) != expected + 2 {
            return Err(BusError::Invalid("unexpected response length".into()));
        }
        if frame.len() >= 4 && frame.len() == usize::from(frame[3]) + 4 {
            if frame[2] != id {
                return Err(BusError::Invalid("response ID mismatch".into()));
            }
            if frame[2..].iter().fold(0u8, |a, b| a.wrapping_add(*b)) != 255 {
                return Err(BusError::Invalid("checksum mismatch".into()));
            }
            return Ok((frame[4], frame[5..frame.len() - 1].to_vec()));
        }
    }
    Err(BusError::Timeout)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_fixed_read_and_ping_packets_can_be_encoded() {
        assert_eq!(
            packet(20, 2, &[56, 15]).unwrap(),
            vec![255, 255, 20, 4, 2, 56, 15, 158]
        );
        for op in [3, 4, 5, 6, 8, 9, 10, 11, 0x83] {
            assert!(packet(20, op, &[]).is_err());
        }
        assert!(packet(254, 1, &[]).is_err());
        assert!(packet(20, 2, &[40, 1]).is_ok());
    }
    fn response(id: u8) -> Vec<u8> {
        let mut v = vec![255, 255, id, 17, 0];
        v.extend([0u8; 15]);
        v.push(!v[2..].iter().fold(0u8, |a, b| a.wrapping_add(*b)));
        v
    }
    #[test]
    fn response_checks_id_checksum_length_and_truncation() {
        let good = response(23);
        assert_eq!(
            read_status(
                &mut std::io::Cursor::new(good.clone()),
                23,
                15,
                Duration::from_millis(20)
            )
            .unwrap()
            .1
            .len(),
            15
        );
        assert!(
            read_status(
                &mut std::io::Cursor::new(good.clone()),
                20,
                15,
                Duration::from_millis(20)
            )
            .is_err()
        );
        let mut bad = good.clone();
        bad[5] = 1;
        assert!(
            read_status(
                &mut std::io::Cursor::new(bad),
                23,
                15,
                Duration::from_millis(20)
            )
            .is_err()
        );
        assert!(
            read_status(
                &mut std::io::Cursor::new(good.clone()),
                23,
                0,
                Duration::from_millis(20)
            )
            .is_err()
        );
        assert!(
            read_status(
                &mut std::io::Cursor::new(&good[..8]),
                23,
                15,
                Duration::from_millis(20)
            )
            .is_err()
        );
    }
}

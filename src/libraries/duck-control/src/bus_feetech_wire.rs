// Hatchery: transport excerpt; FT6 IMU and commissioning are not imported.
// Source and license: docs/RADXA_RUNTIME.md and UPSTREAM_IMPORT.json.
//! Native Feetech TTL packets. No Dynamixel packets or address translation.
//!
//! Read-only HD1910 bring-up. No FT6 IMU, partial frames or write operations.
//! Feedback register interpretation and calibration belong to the RobotIo adapter.
use std::collections::{BTreeMap, BTreeSet};
use std::io::{Read, Write};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::io::{IoError, Result};

pub const BAUD: u32 = 1_000_000;
pub const BROADCAST: u8 = 254;
pub const READ: u8 = 2;
pub const SYNC_READ: u8 = 0x82;

fn error(message: impl Into<String>) -> IoError {
    IoError::Bus(message.into())
}

pub fn packet(id: u8, instruction: u8, params: &[u8]) -> Result<Vec<u8>> {
    if id == 255 || params.len() > 253 {
        return Err(error("Feetech invalid ID or packet length"));
    }
    let mut out = vec![255, 255, id, (params.len() + 2) as u8, instruction];
    out.extend_from_slice(params);
    let sum = out[2..].iter().fold(0u8, |a, b| a.wrapping_add(*b));
    out.push(!sum);
    Ok(out)
}

#[derive(Debug, PartialEq)]
pub struct Status {
    pub id: u8,
    pub error: u8,
    pub data: Vec<u8>,
}
#[derive(Default)]
pub struct Decoder {
    bytes: Vec<u8>,
    expected_length: Option<u8>,
    pub bad_checksums: u64,
    pub discarded: u64,
}
impl Decoder {
    pub fn for_sync_read(length: u8) -> Self {
        Self {
            expected_length: length.checked_add(2),
            ..Self::default()
        }
    }
    pub fn push(&mut self, byte: u8) -> Option<Status> {
        self.bytes.push(byte);
        loop {
            if self.bytes.len() < 2 {
                return None;
            }
            if self.bytes[..2] != [255, 255] {
                self.bytes.remove(0);
                self.discarded += 1;
                continue;
            }
            if self.bytes.len() < 4 {
                return None;
            }
            if self.bytes[2] >= BROADCAST
                || self.bytes[3] < 2
                || self
                    .expected_length
                    .is_some_and(|length| self.bytes[3] != length)
            {
                self.bytes.remove(0);
                self.discarded += 1;
                continue;
            }
            let length = usize::from(self.bytes[3]) + 4;
            if self.bytes.len() < length {
                return None;
            }
            let sum = self.bytes[2..length]
                .iter()
                .fold(0u8, |a, b| a.wrapping_add(*b));
            if sum != 255 {
                self.bytes.remove(0);
                self.bad_checksums += 1;
                self.discarded += 1;
                continue;
            }
            let status = Status {
                id: self.bytes[2],
                error: self.bytes[4],
                data: self.bytes[5..length - 1].to_vec(),
            };
            self.bytes.drain(..length);
            return Some(status);
        }
    }
}

fn accept_sync_status(
    pending: &mut BTreeSet<u8>,
    replies: &mut BTreeMap<u8, Vec<u8>>,
    status: Status,
    length: u8,
) -> Result<bool> {
    if !pending.contains(&status.id) {
        return Err(error(format!(
            "unexpected/duplicate Feetech Sync Read reply from ID {}",
            status.id
        )));
    }
    if status.error != 0 {
        return Err(error(format!(
            "Feetech ID {} Sync Read status error 0x{:02x}",
            status.id, status.error
        )));
    }
    if status.data.len() != usize::from(length) {
        return Err(IoError::ShortRead {
            what: "Feetech Sync Read status",
            expected: usize::from(length),
            got: status.data.len(),
        });
    }
    pending.remove(&status.id);
    replies.insert(status.id, status.data);
    Ok(pending.is_empty())
}

pub struct Bus {
    port: Box<dyn serialport::SerialPort>,
    timeout: Duration,
    read_only: bool,
    pub last_sync: SyncTrace,
}
#[derive(Debug, Clone, Default, Serialize)]
pub struct SyncTrace {
    pub address: u8,
    pub length: u8,
    pub missing_ids: Vec<u8>,
    pub bad_checksums: u64,
    pub discarded: u64,
    pub elapsed_us: u64,
    pub rx_bytes: usize,
    pub deadline_exceeded: bool,
    pub complete_but_late: bool,
    pub request_sent: bool,
    pub partial_received: bool,
}

impl Bus {
    pub fn open(path: &str) -> Result<Self> {
        let builder = serialport::new(path, BAUD).timeout(Duration::from_millis(2));
        #[cfg(unix)]
        let port: Box<dyn serialport::SerialPort> = {
            let mut tty = builder.open_native().map_err(|e| error(e.to_string()))?;
            tty.set_exclusive(true).map_err(|e| error(e.to_string()))?;
            Box::new(tty)
        };
        #[cfg(not(unix))]
        let port = builder.open().map_err(|e| error(e.to_string()))?;
        Ok(Self {
            port,
            timeout: Duration::from_millis(30),
            read_only: true,
            last_sync: SyncTrace::default(),
        })
    }
    pub fn open_read_only(path: &str) -> Result<Self> {
        let mut bus = Self::open(path)?;
        bus.read_only = true;
        bus.timeout = Duration::from_millis(40);
        Ok(bus)
    }

    fn send(&mut self, bytes: &[u8], deadline: Instant) -> Result<()> {
        if self.read_only && !matches!(bytes.get(4).copied(), Some(1 | READ | SYNC_READ)) {
            return Err(error("read-only motor bus: write instruction refused"));
        }
        self.port
            .clear(serialport::ClearBuffer::Input)
            .map_err(|e| error(e.to_string()))?;
        let mut remaining = bytes;
        while !remaining.is_empty() {
            self.poll_timeout(deadline)?;
            match self.port.write(remaining) {
                Ok(0) => return Err(error("Feetech request write returned zero")),
                Ok(count) => remaining = &remaining[count..],
                Err(e)
                    if matches!(
                        e.kind(),
                        std::io::ErrorKind::Interrupted
                            | std::io::ErrorKind::TimedOut
                            | std::io::ErrorKind::WouldBlock
                    ) => {}
                Err(e) => return Err(error(e.to_string())),
            }
        }
        // On the HAT, direction is automatic. Start receiving a request's replies
        // immediately: Unix SerialPort::flush calls tcdrain and can delay the
        // control thread after the small request has already left the UART.
        Ok(())
    }

    fn poll_timeout(&mut self, deadline: Instant) -> Result<()> {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Err(error("Feetech transaction deadline exceeded"));
        }
        self.port
            .set_timeout(left.min(Duration::from_millis(2)))
            .map_err(|e| error(e.to_string()))
    }

    fn exchange(&mut self, id: u8, inst: u8, params: &[u8], count: usize) -> Result<Vec<u8>> {
        self.exchange_budget(id, inst, params, count, self.timeout)
    }

    fn exchange_budget(
        &mut self,
        id: u8,
        inst: u8,
        params: &[u8],
        count: usize,
        budget: Duration,
    ) -> Result<Vec<u8>> {
        if id >= BROADCAST {
            return Err(error("unicast reply required"));
        }
        let tx = packet(id, inst, params)?;
        let deadline = Instant::now() + budget;
        self.send(&tx, deadline)?;
        let mut decoder = Decoder::default();
        let mut one = [0u8; 1];
        while Instant::now() < deadline {
            self.poll_timeout(deadline)?;
            match self.port.read(&mut one) {
                Ok(0) => continue,
                Ok(_) => {
                    if let Some(status) = decoder.push(one[0]) {
                        if status.id != id {
                            continue;
                        }
                        // READ/PING echo is unambiguously an instruction, not an empty
                        // successful status. Do not interpret the echoed READ as error 2.
                        if status.error == inst && status.data == params {
                            continue;
                        }
                        if status.error != 0 {
                            return Err(error(format!(
                                "Feetech ID {id} status error 0x{:02x}",
                                status.error
                            )));
                        }
                        if status.data.len() != count {
                            return Err(IoError::ShortRead {
                                what: "Feetech status",
                                expected: count,
                                got: status.data.len(),
                            });
                        }
                        return Ok(status.data);
                    }
                }
                Err(e)
                    if matches!(
                        e.kind(),
                        std::io::ErrorKind::TimedOut
                            | std::io::ErrorKind::WouldBlock
                            | std::io::ErrorKind::Interrupted
                    ) => {}
                Err(e) => return Err(error(e.to_string())),
            }
        }
        Err(error(format!("Feetech ID {id} response timeout")))
    }

    pub fn ping(&mut self, id: u8) -> Result<()> {
        self.exchange(id, 1, &[], 0).map(|_| ())
    }
    pub fn read(&mut self, id: u8, address: u8, length: u8) -> Result<Vec<u8>> {
        if length == 0 || length > 253 || u16::from(address) + u16::from(length) > 256 {
            return Err(error("invalid Feetech register range"));
        }
        self.exchange(id, READ, &[address, length], usize::from(length))
    }
    pub fn sync_read(
        &mut self,
        address: u8,
        length: u8,
        ids: &[u8],
    ) -> Result<BTreeMap<u8, Vec<u8>>> {
        self.sync_read_inner(address, length, ids)
    }

    fn sync_read_inner(
        &mut self,
        address: u8,
        length: u8,
        ids: &[u8],
    ) -> Result<BTreeMap<u8, Vec<u8>>> {
        let started = Instant::now();
        let deadline = started + self.timeout;
        let mut pending = ids.iter().copied().collect::<BTreeSet<_>>();
        let mut decoder = Decoder::for_sync_read(length);
        let mut rx_bytes = 0;
        let mut complete_but_late = false;
        let mut request_sent = false;
        let result = (|| {
            self.send(&sync_read_packet(address, length, ids)?, deadline)?;
            request_sent = true;
            let mut replies = BTreeMap::new();
            let mut failure = None;
            let mut bytes = [0u8; 256];
            while Instant::now() < deadline {
                if self.poll_timeout(deadline).is_err() {
                    break;
                }
                match self.port.read(&mut bytes) {
                    Ok(count) => {
                        rx_bytes += count;
                        for byte in &bytes[..count] {
                            if let Some(status) = decoder.push(*byte) {
                                if let Err(error) =
                                    accept_sync_status(&mut pending, &mut replies, status, length)
                                {
                                    failure.get_or_insert(error);
                                }
                            }
                        }
                        if pending.is_empty() {
                            if let Some(error) = failure {
                                return Err(error);
                            }
                            if decoder.bad_checksums > 0 {
                                return Err(error("Feetech Sync Read checksum error"));
                            }
                            let completed = Instant::now();
                            if completed >= deadline {
                                complete_but_late = true;
                                break;
                            }
                            return Ok(replies);
                        }
                    }
                    Err(e)
                        if matches!(
                            e.kind(),
                            std::io::ErrorKind::TimedOut
                                | std::io::ErrorKind::WouldBlock
                                | std::io::ErrorKind::Interrupted
                        ) => {}
                    Err(e) => return Err(error(e.to_string())),
                }
            }
            if let Some(error) = failure {
                return Err(error);
            }
            if complete_but_late {
                return Err(error(
                    "Feetech Sync Read complete but transaction deadline exceeded",
                ));
            }
            Err(error(format!(
                "Feetech Sync Read {}; missing IDs {:?}",
                if decoder.bad_checksums > 0 {
                    "checksum error"
                } else {
                    "timeout"
                },
                pending.iter().copied().collect::<Vec<_>>()
            )))
        })();
        let partial_received = result.is_ok() && !pending.is_empty();
        self.last_sync = SyncTrace {
            address,
            length,
            missing_ids: pending.into_iter().collect(),
            bad_checksums: decoder.bad_checksums,
            discarded: decoder.discarded,
            elapsed_us: started.elapsed().as_micros() as u64,
            rx_bytes,
            deadline_exceeded: Instant::now() >= deadline,
            complete_but_late,
            request_sent,
            partial_received,
        };
        result
    }
}

pub fn sync_read_packet(address: u8, length: u8, ids: &[u8]) -> Result<Vec<u8>> {
    let mut unique = BTreeSet::new();
    if length == 0
        || length > 253
        || u16::from(address) + u16::from(length) > 256
        || ids.is_empty()
        || ids.len() > 251
        || ids.iter().any(|id| *id >= BROADCAST || !unique.insert(*id))
    {
        return Err(error("invalid Feetech Sync Read address/length/ID order"));
    }
    let mut params = Vec::with_capacity(ids.len() + 2);
    params.extend_from_slice(&[address, length]);
    params.extend_from_slice(ids);
    packet(BROADCAST, SYNC_READ, &params)
}

// Compatibility with the existing FT RobotIo adapter; preserve caller ID order.
impl Bus {
    pub fn sync_read_raw_data(
        &mut self,
        ids: &[u8],
        address: u8,
        length: u8,
    ) -> Result<Vec<Vec<u8>>> {
        let mut replies = self.sync_read(address, length, ids)?;
        ids.iter()
            .map(|id| {
                replies
                    .remove(id)
                    .ok_or_else(|| error(format!("missing FT ID {id}")))
            })
            .collect()
    }
}

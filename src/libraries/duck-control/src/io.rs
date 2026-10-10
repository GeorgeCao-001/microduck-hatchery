//! Frozen SCS words are diagnostic references, not verified HD physical units.
use duck_ipc_proto::ReferenceWords;
pub const REFERENCE_PROFILE: &str = "ft-scs-frozen-reference-v1";
fn word(data: &[u8], index: usize) -> u16 {
    u16::from_le_bytes([data[index], data[index + 1]])
}
fn sign15(n: u16) -> i32 {
    if n & 0x8000 != 0 {
        -i32::from(n & 0x7fff)
    } else {
        i32::from(n)
    }
}
fn sign10(n: u16) -> i32 {
    if n & 0x400 != 0 {
        -i32::from(n & 0x3ff)
    } else {
        i32::from(n)
    }
}
pub fn decode_reference(data: &[u8]) -> Option<ReferenceWords> {
    if data.len() != 15 {
        return None;
    }
    Some(ReferenceWords {
        position_raw: sign15(word(data, 0)),
        speed_raw: sign15(word(data, 2)),
        load_raw: sign10(word(data, 4)),
        voltage_raw: data[6],
        temperature_raw: data[7],
        state_raw: data[9],
        moving_raw: data[10],
        goal_raw: sign15(word(data, 11)),
        current_raw: sign15(word(data, 13)),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frozen_signs_keep_raw_current_and_full_original_block() {
        let data = [1, 128, 2, 128, 3, 4, 78, 32, 0, 5, 1, 0, 8, 4, 128];
        let v = decode_reference(&data).unwrap();
        assert_eq!(
            (v.position_raw, v.speed_raw, v.load_raw, v.current_raw),
            (-1, -2, -3, -4)
        );
        assert_eq!(
            (v.voltage_raw, v.temperature_raw, v.goal_raw),
            (78, 32, 2048)
        );
        assert!(decode_reference(&data[..14]).is_none());
    }
}

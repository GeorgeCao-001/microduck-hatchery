// Exercise the real protocol parser on desktop builds as well as Linux.
#[path = "../src/camera_controls.rs"]
#[allow(dead_code)] // The exposure worker is outside these portable protocol tests.
mod camera_controls;
#[path = "../src/rkaiq.rs"]
mod rkaiq;
#[path = "../src/rkaiq_control.rs"]
mod rkaiq_control;

#[cfg(not(unix))]
#[test]
fn unsupported_host_does_not_advertise_isp_controls() {
    assert!(rkaiq::Client::new().parameters().is_empty());
}

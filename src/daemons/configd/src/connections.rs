//! Web adapter for the official Net/Pads implementations; no second NM or BlueZ stack.
use super::Service;
use duck_ipc_proto::connections::Action;
use serde_json::{Value, json};
use std::time::Duration;

pub(super) async fn status(service: &Service) -> Result<Value, String> {
    let wifi = async {
        let state = service.net.status().await?;
        let enabled = service.net.radio().await.ok().flatten();
        Ok::<_, String>(json!({"state":state,"enabled":enabled}))
    };
    let (wifi, bt) = tokio::join!(
        tokio::time::timeout(Duration::from_secs(3), wifi),
        tokio::time::timeout(Duration::from_secs(3), service.pads.bluetooth_status())
    );
    let (wifi, wifi_error) = match wifi {
        Ok(Ok(s)) => (Some(s), None),
        Ok(Err(e)) => (None, Some(e)),
        Err(_) => (None, Some("Wi-Fi status timed out".into())),
    };
    let (bluetooth, bluetooth_error) = match bt {
        Ok(Ok(s)) => (Some(s), None),
        Ok(Err(e)) => (None, Some(e)),
        Err(_) => (None, Some("Bluetooth status timed out".into())),
    };
    Ok(
        json!({"protocol_version":"hatchery-connections/1","source":if service.net.is_fake()&&service.pads.is_fake(){"fixture"}else{"hardware"},"wifi_available":!service.net.is_fake(),"bluetooth_available":!service.pads.is_fake(),"wifi":wifi,"wifi_error":wifi_error,"bluetooth":bluetooth,"bluetooth_error":bluetooth_error}),
    )
}
pub(super) async fn command(service: &Service, action: Action) -> Result<Value, String> {
    action.validate().map_err(str::to_owned)?;
    let wifi = matches!(
        &action,
        Action::WifiScan {}
            | Action::WifiConnect { .. }
            | Action::WifiForget { .. }
            | Action::WifiRadio { .. }
            | Action::WifiDisconnect {}
    );
    if (wifi && service.net.is_fake()) || (!wifi && service.pads.is_fake()) {
        return Err("This connection backend is unavailable".into());
    }
    let result = match action {
        Action::WifiScan {} => {
            serde_json::to_value(service.net.scan().await?).map_err(|e| e.to_string())?
        }
        Action::WifiConnect { ssid, psk } => {
            serde_json::to_value(service.net.connect(&ssid, psk.as_deref()).await?)
                .map_err(|e| e.to_string())?
        }
        Action::WifiForget { ssid } => {
            serde_json::to_value(service.net.forget(&ssid).await?).map_err(|e| e.to_string())?
        }
        Action::WifiRadio { enabled } => {
            service.net.set_radio(enabled).await?;
            json!({"enabled":enabled})
        }
        Action::WifiDisconnect {} => {
            service.net.disconnect().await?;
            json!({"disconnected":true})
        }
        Action::BluetoothScan {} => {
            serde_json::to_value(service.pads.bluetooth_scan().await?).map_err(|e| e.to_string())?
        }
        Action::BluetoothRadio { enabled } => {
            service.pads.bluetooth_radio(enabled).await?;
            json!({"enabled":enabled})
        }
        // Explicit MAC selects one device; pairing and its device-scoped agent remain upstream.
        Action::BluetoothPair { mac } => serde_json::to_value(
            service
                .pads
                .pair(Some(&mac), Duration::from_secs(15))
                .await?,
        )
        .map_err(|e| e.to_string())?,
        Action::BluetoothConnect { mac } => {
            service.pads.bluetooth_link(&mac, true).await?;
            json!({"requested":true})
        }
        Action::BluetoothDisconnect { mac } => {
            service.pads.bluetooth_link(&mac, false).await?;
            json!({"requested":true})
        }
        Action::BluetoothForget { mac } => {
            serde_json::to_value(service.pads.forget(&mac).await?).map_err(|e| e.to_string())?
        }
    };
    Ok(result)
}

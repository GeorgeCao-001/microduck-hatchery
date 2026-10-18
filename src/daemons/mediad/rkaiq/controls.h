// SPDX-License-Identifier: Apache-2.0
#pragma once
#include "uAPI2/rk_aiq_user_api2_sysctl.h"

// Same process and context as the upstream 3A server; never a second ISP engine.
struct HatcheryControls;
HatcheryControls* hatchery_controls_create(rk_aiq_sys_ctx_t*, const char* capture_device);
void hatchery_controls_active(HatcheryControls*, bool);
void hatchery_controls_destroy(HatcheryControls*);

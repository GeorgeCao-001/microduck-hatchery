// SPDX-License-Identifier: Apache-2.0
// API2 calls reuse Rockchip's ISP21 implementation. The Gamma verification grid
// and rounding follow uAPI2/rk_aiq_user_api2_agamma.cpp; see RKAIQ_SERVER_IMPORT.json.
#include "controls.h"
#include "uAPI2/rk_aiq_user_api2_imgproc.h"
#include "uAPI2/rk_aiq_user_api2_awb.h"
#include "uAPI2/rk_aiq_user_api2_agamma.h"
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#include <cerrno>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

// HIQ1: 16-byte request (magic, op, key, signed value), little endian.
// Reply: magic, signed status, count, reserved; then count 16-byte records
// (key, signed value, flags: 1=value present, 2=writable, reserved).
// All controls are session-only. No arbitrary functions, JSON paths or IQ writes.
struct Record { uint32_t key; int32_t value; uint32_t flags; };
struct HatcheryControls {
    rk_aiq_sys_ctx_t* ctx;
    int fd = -1;
    std::string path;
    std::mutex mutex;
    bool active = false;
    int gamma = 0; // Known only after verifying a requested coefficient against the ISP LUT.
    std::thread worker;
};
static uint32_t get32(const unsigned char* b) {
    return uint32_t(b[0]) | uint32_t(b[1]) << 8 | uint32_t(b[2]) << 16 | uint32_t(b[3]) << 24;
}
static void put32(std::vector<unsigned char>& b, uint32_t n) {
    for (int i = 0; i < 4; ++i) b.push_back((n >> (i * 8)) & 255);
}
static bool wb_manual(HatcheryControls& c) {
    opMode_t mode = OP_INVAL;
    return rk_aiq_uapi2_getWBMode(c.ctx, &mode) == 0 && mode == OP_MANUAL;
}
static bool gamma_matches(const rk_aiq_gamma_v10_attr_t& a, int value) {
    // Rockchip ISP21's 45-knot logarithmic Gamma grid, not an ISP30/32 curve.
    static const float x[] = {0,1,2,3,4,5,6,7,8,10,12,14,16,20,24,28,32,40,48,56,
        64,80,96,112,128,160,192,224,256,320,384,448,512,640,768,896,1024,1280,
        1536,1792,2048,2560,3072,3584,4095};
    if (value < 1 || value > 10000 || a.mode != RK_AIQ_GAMMA_MODE_MANUAL ||
        !a.stManual.Gamma_en || a.stManual.Gamma_out_offset != 0 ||
        a.stManual.Gamma_out_segnum != GAMMATYPE_LOG) return false;
    for (size_t i = 0; i < sizeof(x) / sizeof(x[0]); ++i) {
        float y = 4095 * std::pow(x[i] / 4095, 1 / (value / 100.0f));
        if (std::abs(int(a.stManual.Gamma_curve[i]) - int(y + 0.5f)) > 1) return false;
    }
    return true;
}
static bool read_control(HatcheryControls& c, unsigned key, Record& r) {
    r = {key, 0, 3};
    unsigned n = UINT32_MAX;
    int rc = -1;
    switch (key) {
    case 1: rc = rk_aiq_uapi2_getSharpness(c.ctx, &n); break;
    case 2: rc = rk_aiq_uapi2_getANRStrth(c.ctx, &n); break;
    case 3: {
        bool on = false;
        rc = rk_aiq_uapi2_getMTNRStrth(c.ctx, &on, &n);
        break;
    }
    case 4: case 5: {
        rk_aiq_gamma_v10_attr_t a{};
        a.sync.sync_mode = RK_AIQ_UAPI_MODE_SYNC;
        if (rk_aiq_user_api2_agamma_v10_GetAttrib(c.ctx, &a) != 0 ||
            (a.mode != RK_AIQ_GAMMA_MODE_AUTO && a.mode != RK_AIQ_GAMMA_MODE_MANUAL)) return false;
        if (key == 4) r.value = a.mode == RK_AIQ_GAMMA_MODE_AUTO;
        else {
            r.flags = a.mode == RK_AIQ_GAMMA_MODE_MANUAL ? 2 : 0;
            if (gamma_matches(a, c.gamma)) { r.value = c.gamma; r.flags |= 1; }
        }
        return true;
    }
    case 6: {
        rk_aiq_wb_mwb_attrib_t a{};
        a.sync.sync_mode = RK_AIQ_UAPI_MODE_SYNC;
        if (rk_aiq_user_api2_awb_GetMwbAttrib(c.ctx, &a) != 0) return false;
        r.flags = wb_manual(c) ? 2 : 0;
        // CCT and RGB-gain modes are different. Do not invent a CCT from RGB gains.
        if (a.mode == RK_AIQ_MWB_MODE_CCT && std::isfinite(a.para.cct.CCT) &&
            a.para.cct.CCT >= 2800 && a.para.cct.CCT <= 7500) {
            r.value = std::lround(a.para.cct.CCT); r.flags |= 1;
        }
        return true;
    }
    case 7: {
        opMode_t mode = OP_INVAL;
        if (rk_aiq_uapi2_getWBMode(c.ctx, &mode) != 0 ||
            (mode != OP_AUTO && mode != OP_MANUAL)) return false;
        r.value = mode == OP_AUTO; return true;
    }
    case 8: case 9: {
        rk_aiq_wb_gain_t gain{};
        if (rk_aiq_uapi2_getWBGain(c.ctx, &gain) != 0) return false;
        const float v = key == 8 ? gain.rgain : gain.bgain;
        if (!std::isfinite(v) || v < 0 || v > 8) return false;
        r.value = std::lround(v * 1000); r.flags = wb_manual(c) ? 3 : 1; return true;
    }
    case 10: rc = rk_aiq_uapi2_getBrightness(c.ctx, &n); break;
    case 11: rc = rk_aiq_uapi2_getContrast(c.ctx, &n); break;
    case 12: rc = rk_aiq_uapi2_getSaturation(c.ctx, &n); break;
    default: return false;
    }
    if (rc != 0 || n > (key <= 3 ? 100u : 255u)) return false;
    r.value = n; return true;
}
static int set_control(HatcheryControls& c, unsigned key, int value) {
    Record before;
    if (!read_control(c, key, before) || !(before.flags & 2)) return -ENOTSUP;
    int rc = -EINVAL;
    if (key >= 1 && key <= 3 && value >= 0 && value <= 100) {
        if (key == 1) rc = rk_aiq_uapi2_setSharpness(c.ctx, value);
        if (key == 2) rc = rk_aiq_uapi2_setANRStrth(c.ctx, value);
        if (key == 3) rc = rk_aiq_uapi2_setMTNRStrth(c.ctx, true, value);
    } else if (key == 4 && (value == 0 || value == 1)) {
        if (value == 0) {
            rc = rk_aiq_uapi2_setGammaCoef(c.ctx, 2.2f, 0.0f);
            if (rc == 0) c.gamma = 220;
        } else {
            rk_aiq_gamma_v10_attr_t a{};
            a.sync.sync_mode = RK_AIQ_UAPI_MODE_SYNC;
            rc = rk_aiq_user_api2_agamma_v10_GetAttrib(c.ctx, &a);
            if (rc == 0) {
                a.mode = RK_AIQ_GAMMA_MODE_AUTO;
                rc = rk_aiq_user_api2_agamma_v10_SetAttrib(c.ctx, &a);
            }
        }
    } else if (key == 5 && value >= 1 && value <= 10000) {
        rc = rk_aiq_uapi2_setGammaCoef(c.ctx, value / 100.0f, 0.0f);
        if (rc == 0) c.gamma = value;
    } else if (key == 6 && value >= 2800 && value <= 7500 && wb_manual(c)) {
        rc = rk_aiq_uapi2_setMWBCT(c.ctx, value);
    } else if (key == 7 && (value == 0 || value == 1)) {
        rc = rk_aiq_uapi2_setWBMode(c.ctx, value ? OP_AUTO : OP_MANUAL);
    } else if ((key == 8 || key == 9) && value >= 0 && value <= 8000 && wb_manual(c)) {
        rk_aiq_wb_gain_t gain{};
        rc = rk_aiq_uapi2_getWBGain(c.ctx, &gain);
        if (rc == 0) {
            if (key == 8) gain.rgain = value / 1000.0f; else gain.bgain = value / 1000.0f;
            rc = rk_aiq_uapi2_setMWBGain(c.ctx, &gain);
        }
    } else if (key >= 10 && key <= 12 && value >= 0 && value <= 255) {
        if (key == 10) rc = rk_aiq_uapi2_setBrightness(c.ctx, value);
        if (key == 11) rc = rk_aiq_uapi2_setContrast(c.ctx, value);
        if (key == 12) rc = rk_aiq_uapi2_setSaturation(c.ctx, value);
    }
    if (rc != 0) return rc;
    if (key == 4 && value == 0) {
        Record coefficient;
        if (!read_control(c, 5, coefficient) || !(coefficient.flags & 1) || coefficient.value != 220) return -EIO;
    }
    Record after;
    if (!read_control(c, key, after) || !(after.flags & 1) ||
        std::abs(after.value - value) > (key <= 3 ? 1 : 0)) return -EIO;
    return 0;
}
static void serve(HatcheryControls& c) {
    for (;;) {
        int fd = accept4(c.fd, nullptr, nullptr, SOCK_CLOEXEC);
        if (fd < 0) { if (errno == EINTR) continue; return; }
        timeval timeout{0, 300000};
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
        unsigned char request[16]; size_t received = 0;
        while (received < sizeof(request)) {
            ssize_t n = recv(fd, request + received, sizeof(request) - received, 0);
            if (n <= 0) break;
            received += n;
        }
        if (received != sizeof(request) || std::memcmp(request, "HIQ1", 4)) { close(fd); continue; }
        uint32_t op = get32(request + 4), key = get32(request + 8);
        int value = int32_t(get32(request + 12));
        int status = -EINVAL;
        std::vector<Record> records;
        {
            std::lock_guard<std::mutex> lock(c.mutex);
            if (!c.active) status = -EAGAIN;
            else if (op == 1 && key == 0 && value == 0) status = 0;
            else if (op == 2 && key >= 1 && key <= 12) status = set_control(c, key, value);
            if (status == 0) for (unsigned i = 1; i <= 12; ++i) {
                Record r; if (read_control(c, i, r)) records.push_back(r);
            }
        }
        std::vector<unsigned char> reply{'H','I','Q','1'};
        put32(reply, status); put32(reply, records.size()); put32(reply, 0);
        for (const auto& r : records) { put32(reply,r.key); put32(reply,r.value); put32(reply,r.flags); put32(reply,0); }
        size_t sent = 0;
        while (sent < reply.size()) {
            ssize_t n = send(fd, reply.data() + sent, reply.size() - sent, MSG_NOSIGNAL);
            if (n <= 0) break;
            sent += n;
        }
        close(fd);
    }
}
HatcheryControls* hatchery_controls_create(rk_aiq_sys_ctx_t* ctx, const char* capture) {
    const char* path = std::getenv("HATCHERY_RKAIQ_CONTROL_SOCKET");
    const char* selected = std::getenv("HATCHERY_CAMERA_DEVICE");
    if (!path || !selected || std::strcmp(selected, capture)) return nullptr;
    sockaddr_un address{}; address.sun_family = AF_UNIX;
    if (std::strlen(path) >= sizeof(address.sun_path)) return nullptr;
    std::strcpy(address.sun_path, path);
    // Never replace a live socket or a file. The launcher uses a private runtime directory.
    struct stat st;
    if (lstat(path, &st) == 0) { std::fprintf(stderr,"ISP control socket already exists: %s\n",path); return nullptr; }
    int fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
    if (fd < 0) return nullptr;
    mode_t mask = umask(0077);
    int rc = bind(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address));
    umask(mask);
    if (rc < 0 || listen(fd, 4) < 0) { close(fd); if (rc == 0) unlink(path); return nullptr; }
    auto* c = new HatcheryControls;
    c->ctx = ctx; c->fd = fd; c->path = path;
    c->worker = std::thread([c] { serve(*c); });
    std::fprintf(stderr,"ISP21 advanced controls: %s (%s)\n",path,capture);
    return c;
}
void hatchery_controls_active(HatcheryControls* c, bool active) {
    if (c) { std::lock_guard<std::mutex> lock(c->mutex); c->active = active; }
}
void hatchery_controls_destroy(HatcheryControls* c) {
    if (!c) return;
    shutdown(c->fd, SHUT_RDWR); close(c->fd);
    if (c->worker.joinable()) c->worker.join();
    unlink(c->path.c_str()); delete c;
}

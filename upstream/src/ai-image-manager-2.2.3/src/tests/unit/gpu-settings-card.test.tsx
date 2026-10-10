import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GpuSettingsCard } from "@/components/gpu-settings-card";
import { ipc } from "@/ipc/manager";

vi.mock("@/ipc/manager", () => ({
  ipc: {
    client: {
      settings: {
        checkGpuCapability: vi.fn(),
        getGpuSettings: vi.fn(),
        getGpuSpeeds: vi.fn().mockResolvedValue({ speeds: [] }),
        setGpuSettings: vi.fn(),
      },
    },
  },
}));

describe("GpuSettingsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.client.settings.getGpuSettings).mockResolvedValue({
      detected: null,
      deviceId: "auto",
      enabled: false,
      promptShown: false,
      searchImageSource: "thumbnail",
      deviceIds: [],
      multiGpuEnabled: false,
      effectiveDevices: [],
    });
  });

  it("reports its loaded state and hides the separate save action in onboarding mode", async () => {
    const onEnabledChange = vi.fn();
    const onLoaded = vi.fn();

    render(
      <GpuSettingsCard
        hideSaveButton
        onEnabledChange={onEnabledChange}
        onLoaded={onLoaded}
      />
    );

    await waitFor(() => {
      expect(onLoaded).toHaveBeenCalledOnce();
    });
    expect(onEnabledChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText("保存")).not.toBeInTheDocument();
  });

  it("reports detection work and the enabled state to the onboarding parent", async () => {
    const onBusyChange = vi.fn();
    const onEnabledChange = vi.fn();
    vi.mocked(ipc.client.settings.checkGpuCapability).mockResolvedValue({
      dmlAvailable: true,
      gpuName: "Test GPU",
      probeTimeMs: 12,
    });

    render(
      <GpuSettingsCard
        hideSaveButton
        onBusyChange={onBusyChange}
        onEnabledChange={onEnabledChange}
      />
    );

    await screen.findByText("gpuDetect");
    onBusyChange.mockClear();
    onEnabledChange.mockClear();
    fireEvent.click(screen.getByText("gpuDetect"));

    await waitFor(() => {
      expect(onEnabledChange).toHaveBeenCalledWith(true);
    });
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("shows DirectML image embedding as active when its probe succeeds", async () => {
    vi.mocked(ipc.client.settings.getGpuSettings).mockResolvedValue({
      detected: {
        dmlAvailable: false,
        embeddingDmlAvailable: true,
        embeddingProbeTimeMs: 34,
        probeTimeMs: 12,
      },
      deviceId: "auto",
      enabled: true,
      promptShown: true,
      searchImageSource: "thumbnail",
      deviceIds: [],
      multiGpuEnabled: false,
      effectiveDevices: [],
    });

    render(<GpuSettingsCard hideSaveButton />);
    await waitFor(() => {
      expect(screen.getByText("gpuStatusActive")).toBeInTheDocument();
    });
  });

  it("shows the detected real GPU name without changing DirectML status", async () => {
    vi.mocked(ipc.client.settings.getGpuSettings).mockResolvedValue({
      detected: {
        dmlAvailable: true,
        gpuName: "NVIDIA GeForce RTX 4060 Laptop GPU",
        probeTimeMs: 34,
      },
      deviceId: "auto",
      enabled: true,
      promptShown: true,
      searchImageSource: "thumbnail",
      deviceIds: [],
      multiGpuEnabled: false,
      effectiveDevices: [],
    });

    render(<GpuSettingsCard hideSaveButton />);

    await waitFor(() => {
      expect(
        screen.getByText("NVIDIA GeForce RTX 4060 Laptop GPU")
      ).toBeInTheDocument();
    });
    expect(screen.getByText("gpuStatusActive")).toBeInTheDocument();
  });

  it("shows CPU fallback after an embedding probe failure without claiming GPU use", async () => {
    vi.mocked(ipc.client.settings.getGpuSettings).mockResolvedValue({
      detected: {
        dmlAvailable: false,
        embeddingDmlAvailable: false,
        embeddingError: "model incompatible",
        probeTimeMs: 12,
      },
      deviceId: "auto",
      enabled: true,
      promptShown: true,
      searchImageSource: "thumbnail",
      deviceIds: [],
      multiGpuEnabled: false,
      effectiveDevices: [],
    });

    render(<GpuSettingsCard hideSaveButton />);

    await waitFor(() => {
      expect(screen.getByText("gpuStatusProbeFailed")).toBeInTheDocument();
    });
    expect(screen.queryByText("gpuStatusActive")).not.toBeInTheDocument();
  });

  // 自用新增：手动选显卡 + AI 占用限制要能存下来
  it("lists usable adapters and saves the manual pick", async () => {
    vi.mocked(ipc.client.settings.getGpuSettings).mockResolvedValue({
      detected: {
        adapters: [
          { deviceId: 0, name: "Intel(R) UHD Graphics", ok: true },
          { deviceId: 1, name: "NVIDIA GeForce RTX 4060 Laptop GPU", ok: true },
          { deviceId: 2, name: null, ok: false },
        ],
        dmlAvailable: true,
        gpuName: "NVIDIA GeForce RTX 4060 Laptop GPU",
        probeTimeMs: 30,
      },
      deviceId: "auto",
      enabled: true,
      promptShown: true,
      searchImageSource: "thumbnail",
      deviceIds: [],
      multiGpuEnabled: false,
      effectiveDevices: [],
    });
    vi.mocked(ipc.client.settings.setGpuSettings).mockResolvedValue({
      ok: true,
    });

    render(<GpuSettingsCard />);

    const select = await screen.findByLabelText("gpuAdapterTitle");
    // 自用（问题 5）：改用应用自己的下拉（FilterDropdown），选项要点开才渲染。
    fireEvent.click(select);
    // 只有可用的适配器进下拉框
    fireEvent.click(
      await screen.findByRole("option", {
        name: "NVIDIA GeForce RTX 4060 Laptop GPU",
      })
    );
    expect(screen.queryByText("gpuAdapterIndex")).not.toBeInTheDocument();

    // 保存按钮是逐字动画，按文字取不到，用角色 + 名字取（测试环境里该键有真实译文）。
    fireEvent.click(screen.getByRole("button", { name: /保存|save/i }));

    await waitFor(() => {
      expect(ipc.client.settings.setGpuSettings).toHaveBeenCalledWith({
        deviceId: "1",
        enabled: true,
        searchImageSource: "thumbnail",
        deviceIds: [],
        multiGpuEnabled: false,
      });
    });
  });
  it("saves the feature source with the multi-GPU fields", async () => {
    render(<GpuSettingsCard />);

    // 默认缩略图（快）：下拉框有选项可开
    const sourceSelect = await screen.findByLabelText("searchImageSourceTitle");
    expect(sourceSelect).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(ipc.client.settings.setGpuSettings).toHaveBeenCalledWith({
        deviceId: "auto",
        enabled: false,
        searchImageSource: "thumbnail",
        deviceIds: [],
        multiGpuEnabled: false,
      });
    });
  });

  it("sends the original-photo source when the user picks higher fidelity", async () => {
    render(<GpuSettingsCard />);

    fireEvent.click(await screen.findByLabelText("searchImageSourceTitle"));
    fireEvent.click(
      screen.getByRole("option", { name: "searchImageSourceOriginal" })
    );
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(ipc.client.settings.setGpuSettings).toHaveBeenCalledWith({
        deviceId: "auto",
        enabled: false,
        searchImageSource: "original",
        deviceIds: [],
        multiGpuEnabled: false,
      });
    });
  });
  /**
   * 用户明确要求：**只用 1 张卡时完全不显示每卡速度**（顶上已有总速度，重复没意义）。
   */
  it("hides the per-card speeds when only one GPU is in use", async () => {
    vi.mocked(ipc.client.settings.getGpuSettings).mockResolvedValue({
      detected: { dmlAvailable: true, gpuName: "Test GPU", probeTimeMs: 12 },
      deviceId: "2",
      deviceIds: [2],
      effectiveDevices: [2],
      enabled: true,
      multiGpuEnabled: false,
      promptShown: true,
      searchImageSource: "thumbnail",
    });
    vi.mocked(ipc.client.settings.getGpuSpeeds).mockResolvedValue({
      speeds: [{ deviceId: 2, label: null, perSecond: 12.3 }],
    });

    render(<GpuSettingsCard />);

    // 等状态行渲染出来（说明轮询也回来了）
    expect(await screen.findByText("gpuStatusFace")).toBeInTheDocument();
    await waitFor(() => {
      expect(ipc.client.settings.getGpuSpeeds).toHaveBeenCalled();
    });
    expect(screen.queryByText("multiGpuCardLabel")).toBeNull();
  });

  /**
   * 用户明确要求：**≥2 张才显示，用几张显示几个**（最多 3 张）。
   */
  it("shows exactly as many per-card speeds as GPUs in use", async () => {
    vi.mocked(ipc.client.settings.getGpuSettings).mockResolvedValue({
      detected: { dmlAvailable: true, gpuName: "Test GPU", probeTimeMs: 12 },
      deviceId: "2",
      deviceIds: [2, 3],
      effectiveDevices: [2, 3],
      enabled: true,
      multiGpuEnabled: true,
      promptShown: true,
      searchImageSource: "thumbnail",
    });
    vi.mocked(ipc.client.settings.getGpuSpeeds).mockResolvedValue({
      speeds: [
        { deviceId: 2, label: null, perSecond: 11.1 },
        { deviceId: 3, label: null, perSecond: 22.2 },
      ],
    });

    render(<GpuSettingsCard />);

    /*
     * 两张卡 → 正好两栏。
     * ⚠️ 测试环境的 `t()` 是替身：带插值的键（multiGpuCardSpeed / multiGpuCardLabel）
     * 直接返回键名、不会把数字插进去，所以只能断言"栏数"，不能断言 11.1 这种数值。
     * multiGpuCardLabel 在每个栏里各出现一次 → 出现几次就是几栏。
     */
    await waitFor(() => {
      expect(screen.getAllByText("multiGpuCardLabel")).toHaveLength(2);
    });
  });
});

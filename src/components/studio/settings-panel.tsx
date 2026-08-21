import { Contrast, Crop, Eraser, Eye, Gauge, Maximize, Palette, ScanText, Shield, Sparkles, VolumeX, Wand2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStudio } from "@/lib/jobs";
import type { EnhancementSettings, OutputFormat } from "@/lib/types";

function Row({
  icon,
  title,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 items-center justify-center rounded-xl ${
              enabled ? "bg-accent/15 text-accent" : "bg-elevated text-muted"
            }`}
          >
            {icon}
          </div>
          <div>
            <Label className="text-sm font-medium text-fg">{title}</Label>
            <p className="text-xs text-muted">{enabled ? "On" : "Off"}</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && children ? <div className="mt-4 space-y-4">{children}</div> : null}
    </section>
  );
}

function Slide({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className="font-mono text-xs text-accent tabular-nums">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}

export function SettingsPanel() {
  const settings = useStudio((s) => s.settings);
  const setSettings = useStudio((s) => s.setSettings);
  const patch = (partial: Partial<EnhancementSettings>) =>
    setSettings({ ...settings, ...partial });

  return (
    <div className="mx-auto h-full max-w-2xl overflow-auto px-4 py-6 sm:px-6">
      <h2 className="font-display text-2xl tracking-tight text-fg text-balance">
        Enhancement
      </h2>
      <p className="mt-1 mb-6 text-sm text-muted text-pretty">
        Crop and identify first, then CNN restore, descratch, denoise, color,
        contrast, sharpen, foil protect. Real-ESRGAN infers missing detail.
        YOLO26 finds the card. Vision OCR reads foil type. Up to four cards at once.
      </p>
      <div className="flex flex-col gap-3">
        <Row
          icon={<Crop className="size-4" />}
          title="YOLO26 auto-crop"
          enabled={settings.autoCrop}
          onToggle={(v) => patch({ autoCrop: v })}
        />
        <Row
          icon={<ScanText className="size-4" />}
          title="OCR any card"
          enabled={settings.identifyCards}
          onToggle={(v) => patch({ identifyCards: v })}
        />
        <Row
          icon={<Eye className="size-4" />}
          title="Vision OCR"
          enabled={settings.visionOcr && settings.identifyCards}
          onToggle={(v) => patch({ visionOcr: v })}
        />
        <Row
          icon={<Sparkles className="size-4" />}
          title="CNN restore"
          enabled={settings.cnnRestore}
          onToggle={(v) => patch({ cnnRestore: v })}
        />
        <Row
          icon={<Wand2 className="size-4" />}
          title="Blemish removal"
          enabled={settings.blemishRemoval}
          onToggle={(v) => patch({ blemishRemoval: v })}
        >
          <Slide
            label="Sensitivity"
            value={settings.blemishSensitivity}
            min={0.2}
            max={1}
            step={0.05}
            onChange={(v) => patch({ blemishSensitivity: v })}
          />
        </Row>
        <Row
          icon={<Eraser className="size-4" />}
          title="Descratch"
          enabled={settings.descratch}
          onToggle={(v) => patch({ descratch: v })}
        />
        <Row
          icon={<VolumeX className="size-4" />}
          title="Noise reduction"
          enabled={settings.noiseReduction}
          onToggle={(v) => patch({ noiseReduction: v })}
        >
          <Slide
            label="Strength"
            value={settings.noiseReductionStrength}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patch({ noiseReductionStrength: v })}
          />
        </Row>
        <Row
          icon={<Palette className="size-4" />}
          title="Color correction"
          enabled={settings.colorCorrection}
          onToggle={(v) => patch({ colorCorrection: v })}
        >
          <Slide
            label="Temperature"
            value={settings.colorTemperature}
            min={-1}
            max={1}
            step={0.05}
            onChange={(v) => patch({ colorTemperature: v })}
          />
          <Slide
            label="Saturation"
            value={settings.saturation}
            min={0.4}
            max={1.8}
            step={0.05}
            onChange={(v) => patch({ saturation: v })}
          />
        </Row>
        <Row
          icon={<Contrast className="size-4" />}
          title="Contrast"
          enabled={settings.contrastEnhancement}
          onToggle={(v) => patch({ contrastEnhancement: v })}
        >
          <Slide
            label="Amount"
            value={settings.contrastAmount}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patch({ contrastAmount: v })}
          />
        </Row>
        <Row
          icon={<Sparkles className="size-4" />}
          title="Sharpen"
          enabled={settings.sharpening}
          onToggle={(v) => patch({ sharpening: v })}
        >
          <Slide
            label="Amount"
            value={settings.sharpeningAmount}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patch({ sharpeningAmount: v })}
          />
        </Row>
        <Row
          icon={<Maximize className="size-4" />}
          title="Upscale"
          enabled={settings.upscaling}
          onToggle={(v) => patch({ upscaling: v })}
        >
          <div className="flex gap-2">
            {([2, 4] as const).map((factor) => (
              <button
                key={factor}
                type="button"
                onClick={() => patch({ upscaleFactor: factor })}
                className={`h-11 flex-1 rounded-xl border text-sm font-medium ${
                  settings.upscaleFactor === factor
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-elevated text-muted"
                }`}
              >
                {factor}×
              </button>
            ))}
          </div>
        </Row>
        <Row
          icon={<Shield className="size-4" />}
          title="Preserve holographic foil"
          enabled={settings.preserveHolographic}
          onToggle={(v) => patch({ preserveHolographic: v })}
        />

        <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Gauge className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-fg">Worker pool</p>
              <p className="text-xs text-muted">Parallel enhance slots for 100+ lots</p>
            </div>
          </div>
          <div className="flex gap-2">
            {([1, 2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => patch({ concurrency: n })}
                className={`h-11 flex-1 rounded-xl border text-sm font-medium ${
                  settings.concurrency === n
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-elevated text-muted"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <p className="mb-4 text-sm font-medium text-fg">Output</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-muted">Format</Label>
              <Select
                value={settings.outputFormat}
                onValueChange={(v) => patch({ outputFormat: v as OutputFormat })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpg">JPG</SelectItem>
                  <SelectItem value="webp">WebP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Slide
              label="Quality"
              value={settings.outputQuality}
              min={60}
              max={100}
              step={1}
              format={(v) => `${v}`}
              onChange={(v) => patch({ outputQuality: v })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

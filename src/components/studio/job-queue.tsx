import { Download, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useStudio } from "@/lib/jobs";
import { fileNameForIdentity } from "@/lib/identify";
import { downloadJobZip, downloadUrl } from "@/lib/pipeline";
import { shortId } from "@/lib/utils";
import type { ProcessingJob } from "@/lib/types";

function statusLabel(job: ProcessingJob) {
  if (job.status === "processing") return "Processing";
  if (job.status === "completed") return "Complete";
  if (job.status === "failed") return "Failed";
  return "Queued";
}

export function JobQueue() {
  const jobs = useStudio((s) => s.jobs);
  const selectJob = useStudio((s) => s.selectJob);
  const removeJob = useStudio((s) => s.removeJob);

  const onDownload = async (job: ProcessingJob) => {
    const done = job.images.filter((img) => img.enhancedUrl);
    if (!done.length) {
      toast.error("Nothing ready to download");
      return;
    }
    const ext = job.settings.outputFormat;
    if (done.length === 1) {
      const img = done[0];
      downloadUrl(img.enhancedUrl!, fileNameForIdentity(img.identity, img.name, ext));
      return;
    }
    await downloadJobZip(
      done.map((img) => ({
        name: fileNameForIdentity(img.identity, img.name, ext),
        url: img.enhancedUrl!,
      })),
      `cardenhance-${shortId(job.id)}.zip`,
    );
  };

  if (!jobs.length) {
    return (
      <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-xl text-fg">No jobs yet</p>
        <p className="mt-2 max-w-sm text-sm text-muted text-pretty">
          Upload a lot or a ZIP of 100+ cards. Progress, identity, and downloads
          show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-auto px-4 py-6 sm:px-6">
      <h2 className="mb-5 font-display text-2xl tracking-tight text-fg">Jobs</h2>
      <ul className="flex flex-col gap-3">
        {jobs.map((job) => {
          const done = job.images.filter(
            (img) => img.status === "completed" || img.status === "failed",
          ).length;
          const tagged = job.images.filter((img) => img.identity?.player).length;
          const cropped = job.images.filter((img) => img.cropped).length;
          return (
            <li key={job.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-muted tabular-nums">{shortId(job.id)}</p>
                  <p className="mt-1 text-sm text-fg">
                    <span className="font-mono tabular-nums">
                      {done}/{job.images.length}
                    </span>{" "}
                    card{job.images.length === 1 ? "" : "s"}
                    {tagged > 0 ? (
                      <span className="text-muted"> · {tagged} identified</span>
                    ) : null}
                    {cropped > 0 ? (
                      <span className="text-muted"> · {cropped} cropped</span>
                    ) : null}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    job.status === "completed"
                      ? "border-emerald-500/30 text-emerald-400"
                      : job.status === "failed"
                        ? "border-red-500/30 text-red-400"
                        : "border-accent/40 text-accent"
                  }
                >
                  {statusLabel(job)}
                </Badge>
              </div>
              <Progress value={job.progress} className="mt-4" />
              <p className="mt-2 font-mono text-xs text-muted tabular-nums">
                {done}/{job.images.length} · {job.progress}%
              </p>
              {job.error ? <p className="mt-2 text-sm text-red-400">{job.error}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => selectJob(job.id)}
                  disabled={!job.images.some((i) => i.originalUrl)}
                >
                  <Eye className="size-4" />
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDownload(job)}
                  disabled={!job.images.some((i) => i.enhancedUrl)}
                >
                  <Download className="size-4" />
                  Download
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeJob(job.id)}>
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

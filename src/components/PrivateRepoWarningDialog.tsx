interface PrivateRepoWarningDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PrivateRepoWarningDialog({
  onConfirm,
  onCancel,
}: PrivateRepoWarningDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-black border border-white/10 p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold text-white">Warning: Private Repository Information</h3>
        <p className="mb-6 text-white/80">
          You are about to share information about private repositories. This information will be publicly accessible to anyone with the share link. Are you sure you want to proceed?
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white/60 hover:bg-white/20"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            Yes, Share Anyway
          </button>
        </div>
      </div>
    </div>
  );
} 
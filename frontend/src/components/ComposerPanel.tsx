import InputComposer from "./InputComposer";

type ComposerPanelProps = {
  onSend?: (payload: { prompt: string; files: File[] }) => Promise<void> | void;
  onClearChats?: () => void;
  sending?: boolean;
};

export default function ComposerPanel({
  onSend,
  onClearChats,
  sending,
}: ComposerPanelProps) {
  return (
    <section className="mt-2">
      <InputComposer
        onSend={onSend}
        onClearChats={onClearChats}
        sending={sending}
      />
    </section>
  );
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type WheelEvent,
} from "react";
import { Modal } from "antd";

type ImagePreviewModalProps = {
  open: boolean;
  imageUrl: string;
  title?: string;
  onClose: () => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function ImagePreviewModal({
  open,
  imageUrl,
  title,
  onClose,
}: ImagePreviewModalProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragAnchor = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    dragAnchor.current = null;
  }, [imageUrl, open]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const handleMove = (event: MouseEvent) => {
      if (!dragAnchor.current) {
        return;
      }
      setOffset({
        x: event.clientX - dragAnchor.current.x,
        y: event.clientY - dragAnchor.current.y,
      });
    };
    const handleUp = () => {
      setIsDragging(false);
      dragAnchor.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging]);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setScale((prev) => {
      const next = clamp(prev + direction * 0.12, 0.4, 4);
      if (next === 1) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLImageElement>) => {
      if (event.button !== 0) {
        return;
      }
      setIsDragging(true);
      dragAnchor.current = {
        x: event.clientX - offset.x,
        y: event.clientY - offset.y,
      };
    },
    [offset.x, offset.y]
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={960}
      centered
      styles={{ body: { padding: 12 } }}
      title={title || "预览"}
    >
      <div
        onWheel={handleWheel}
        className="flex h-[70vh] w-full items-center justify-center overflow-hidden rounded-xl bg-slate-900/5"
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt={title || "预览"}
            onMouseDown={handleMouseDown}
            className="select-none"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              cursor: isDragging ? "grabbing" : "grab",
              userSelect: "none",
            }}
            draggable={false}
          />
        )}
      </div>
    </Modal>
  );
}

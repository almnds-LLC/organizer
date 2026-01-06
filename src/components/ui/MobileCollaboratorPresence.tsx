import { useCursorStore } from '../../store/cursorStore';

interface Props {
  compartmentId: string;
  drawerId: string;
}

export function MobileCollaboratorPresence({ compartmentId, drawerId }: Props) {
  const remoteCursors = useCursorStore((s) => s.remoteCursors);

  const collaborators = Array.from(remoteCursors.values()).filter(
    (cursor) => cursor.drawerId === drawerId && cursor.compartmentId === compartmentId
  );

  if (collaborators.length === 0) return null;

  return (
    <div className="absolute -top-2 -right-2 flex gap-0.5 z-10">
      {collaborators.slice(0, 3).map((collab) => (
        <div
          key={collab.userId}
          className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
          style={{ background: collab.color }}
          title={collab.username}
        />
      ))}
      {collaborators.length > 3 && (
        <div className="w-4 h-4 rounded-full bg-gray-500 border-2 border-white text-[8px] text-white flex items-center justify-center">
          +{collaborators.length - 3}
        </div>
      )}
    </div>
  );
}

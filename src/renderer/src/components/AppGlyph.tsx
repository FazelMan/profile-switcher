import { AppWindow, SquareTerminal } from 'lucide-react';
import type { AppKind } from '@shared/domain/compatibility';

/** Generic glyph for an application kind. No vendor logos are used. */
export function AppGlyph({ kind }: { kind: AppKind | undefined }) {
  const Icon = kind === 'desktop' ? AppWindow : SquareTerminal;
  return <Icon className="icon" aria-hidden="true" />;
}

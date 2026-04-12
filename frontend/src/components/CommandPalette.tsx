import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Command
} from 'lucide-react';
import type { ReactNode } from 'react';

export interface CommandItem {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  action: () => void;
  hidden?: boolean;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const visible = commands.filter(c => !c.hidden);
    if (!query.trim()) return visible;
    const lower = query.toLowerCase();
    return visible.filter(c => c.label.toLowerCase().includes(lower));
  }, [commands, query]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // Focus input on next frame
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep selected index in bounds
  useEffect(() => {
    setSelectedIndex(i => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const runCommand = (cmd: CommandItem) => {
    onClose();
    cmd.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % filtered.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) runCommand(filtered[selectedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!open) return null;

  return (
    <motion.div
      className="command-palette-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={onClose}
    >
      <motion.div
        className="command-palette"
        initial={{ opacity: 0, y: -20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="command-palette-input-row">
          <Search size={18} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            className="command-palette-input"
            type="text"
            placeholder="Type a command…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="command-palette-kbd">esc</kbd>
        </div>
        <div className="command-palette-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="command-palette-empty">No matching commands</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`command-palette-item${i === selectedIndex ? ' selected' : ''}`}
              onClick={() => runCommand(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="command-palette-item-icon">{cmd.icon}</span>
              <span className="command-palette-item-label">{cmd.label}</span>
              {cmd.shortcut && <kbd className="command-palette-shortcut">{cmd.shortcut}</kbd>}
            </button>
          ))}
        </div>
        <div className="command-palette-footer">
          <span><Command size={12} /> <span>K</span> to open</span>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

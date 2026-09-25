'use client';

import React, { useRef, useMemo, useEffect } from 'react';
import { isWordMisspelled, getSpellingSuggestion } from '@/lib/radiology-autocomplete';

interface SpellCheckTextareaProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  fontClass?: string;
}

export default function SpellCheckTextarea({
  value,
  onChange,
  rows = 4,
  className = '',
  placeholder = '',
  disabled = false,
  fontClass = 'font-serif text-sm leading-relaxed',
}: SpellCheckTextareaProps) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Dynamically auto-resize height so no internal scrollbars ever appear in the report
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleReplaceWord = (oldWord: string, newWord: string) => {
    if (!oldWord || !newWord) return;
    const regex = new RegExp(`\\b${oldWord}\\b`, 'g');
    const updated = value.replace(regex, newWord);
    onChange(updated);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Tokenize text into words, spaces, and punctuation to render wavy red underlines and hover tooltips on misspelled words
  const renderedBackdrop = useMemo(() => {
    if (!value) return null;

    // Split text keeping words, spaces, and line breaks
    const tokens = value.split(/(\b[a-zA-Z0-9_]+\b|\n|\s+)/);

    return tokens.map((token, idx) => {
      if (token === '\n') {
        return <br key={idx} />;
      }

      if (/^[a-zA-Z0-9_]+$/.test(token) && isWordMisspelled(token)) {
        const suggestion = getSpellingSuggestion(token);

        return (
          <span
            key={idx}
            className="group relative inline-block pointer-events-auto cursor-pointer underline decoration-wavy decoration-red-500 decoration-2 font-medium text-slate-900 bg-red-100/80 px-0.5 rounded-xs hover:bg-amber-100 transition-colors z-20"
            onClick={(e) => {
              e.stopPropagation();
              if (suggestion) {
                handleReplaceWord(token, suggestion);
              }
            }}
          >
            {token}

            {/* Hover Tooltip showing correct word suggestion */}
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex flex-col items-center z-50 min-w-[150px] shadow-2xl">
              <span className="bg-slate-900 text-white text-[11px] py-1.5 px-3 rounded-md border border-slate-700 whitespace-nowrap text-center font-sans">
                <span className="block font-bold text-amber-400">
                  {suggestion ? `Suggestion: "${suggestion}"` : `Unrecognized word`}
                </span>
                {suggestion && (
                  <span className="block text-[10px] text-emerald-300 font-semibold mt-0.5">
                    Click to replace with &quot;{suggestion}&quot;
                  </span>
                )}
              </span>
              <span className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 border-r border-b border-slate-700"></span>
            </span>
          </span>
        );
      }

      return <span key={idx}>{token}</span>;
    });
  }, [value]);

  return (
    <div className={`relative w-full bg-transparent ${className}`}>
      {/* Backdrop overlay rendering red wavy underlines and hover suggestions */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className={`absolute inset-0 w-full p-0 text-slate-900 whitespace-pre-wrap break-words overflow-hidden pointer-events-none select-none z-0 ${fontClass}`}
        style={{
          boxSizing: 'border-box',
        }}
      >
        {renderedBackdrop}
        {/* Trailing space fix for overlay alignment */}
        {value.endsWith('\n') && <br />}
      </div>

      {/* Transparent textarea auto-expanding height without inner scrollbars */}
      <textarea
        ref={textareaRef}
        rows={rows}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={`relative z-10 w-full p-0 bg-transparent text-transparent caret-slate-900 outline-none border-0 resize-none overflow-hidden whitespace-pre-wrap break-words touch-pan-y select-text ${fontClass}`}
        style={{
          boxSizing: 'border-box',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          boxShadow: 'none',
          resize: 'none',
        }}
      />
    </div>
  );
}


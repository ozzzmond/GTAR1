import React from 'react'
import type { SongLine, ChordSegment } from '../types/gtar'
import { chordLyricWords } from '../utils/chordLyricLayout'

export interface SongLineRendererProps {
  lines: SongLine[]
  fontSizePx?: number
}

export const SongLineRenderer: React.FC<SongLineRendererProps> = ({
  lines,
  fontSizePx = 18,
}) => {
  return (
    <div
      className="space-y-3 font-mono leading-relaxed select-text"
      style={{ fontSize: `${fontSizePx}px` }}
    >
      {lines.map((line, lineIndex) => {
        if (line.type === 'EMPTY') {
          return <div key={lineIndex} className="h-4" />
        }

        if (line.type === 'SECTION_HEADER') {
          return (
            <div
              key={lineIndex}
              className="pt-4 pb-1 text-amber-400 font-bold tracking-wide uppercase text-sm border-b border-slate-700/60"
            >
              {line.title}
            </div>
          )
        }

        if (line.type === 'TAB') {
          return (
            <div
              key={lineIndex}
              className="text-slate-400 bg-slate-950/60 px-2 py-1 rounded text-xs whitespace-pre overflow-x-auto"
            >
              {line.content}
            </div>
          )
        }

        if (line.type === 'CHORD_ROW') {
          return (
            <div
              key={lineIndex}
              className="text-sky-400 font-bold whitespace-pre overflow-x-auto"
            >
              {line.raw}
            </div>
          )
        }

        if (line.type === 'LYRIC') {
          return (
            <div key={lineIndex} className="text-slate-200 whitespace-pre-wrap">
              {line.lyrics}
            </div>
          )
        }

        if (line.type === 'CHORD_PRO') {
          const words = chordLyricWords(line.segments)
          return (
            <div
              key={lineIndex}
              className="flex flex-wrap gap-x-2 gap-y-1 items-end"
            >
              {words.map((wordSegments, wIdx) => (
                <span key={wIdx} className="inline-flex flex-col items-start">
                  <span className="text-sky-400 font-bold min-h-[1.25em] text-[0.9em]">
                    {wordSegments.map((s, sIdx) => (
                      <span key={sIdx} className="mr-0.5">
                        {s.chord || ''}
                      </span>
                    ))}
                  </span>
                  <span className="text-slate-200 whitespace-pre">
                    {wordSegments.map((s) => s.text).join('')}
                  </span>
                </span>
              ))}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

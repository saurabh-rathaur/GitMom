import type { CSSProperties } from 'react'
import { FaBrand, FaIcon } from './FaIcon'

export type RepoLangVisual = {
  accent: string
  iconKind: 'brand' | 'solid'
  iconName: string
}

const DEFAULT_VISUAL: RepoLangVisual = {
  accent: '#64748b',
  iconKind: 'solid',
  iconName: 'file-code',
}

/** Per-language accent + Font Awesome icon (solid or brands). */
const LANG_VISUAL: Record<string, RepoLangVisual> = {
  HTML: { accent: '#e34f26', iconKind: 'brand', iconName: 'html5' },
  'ASP.NET': { accent: '#512bd4', iconKind: 'brand', iconName: 'microsoft' },
  Razor: { accent: '#68217a', iconKind: 'brand', iconName: 'microsoft' },
  TypeScript: { accent: '#3178c6', iconKind: 'brand', iconName: 'node-js' },
  JavaScript: { accent: '#ca8a04', iconKind: 'brand', iconName: 'js' },
  Vue: { accent: '#42b883', iconKind: 'brand', iconName: 'vuejs' },
  Svelte: { accent: '#ff3e00', iconKind: 'solid', iconName: 'bolt' },
  Python: { accent: '#3776ab', iconKind: 'brand', iconName: 'python' },
  Java: { accent: '#007396', iconKind: 'brand', iconName: 'java' },
  'C#': { accent: '#68217a', iconKind: 'brand', iconName: 'microsoft' },
  'F#': { accent: '#378bba', iconKind: 'solid', iconName: 'cube' },
  'VB.NET': { accent: '#004e8c', iconKind: 'brand', iconName: 'microsoft' },
  Go: { accent: '#00add8', iconKind: 'brand', iconName: 'golang' },
  Rust: { accent: '#dea584', iconKind: 'brand', iconName: 'rust' },
  C: { accent: '#555555', iconKind: 'solid', iconName: 'microchip' },
  'C/C++ header': { accent: '#3949ab', iconKind: 'solid', iconName: 'file-code' },
  'C++': { accent: '#00599c', iconKind: 'solid', iconName: 'gears' },
  PHP: { accent: '#777bb4', iconKind: 'brand', iconName: 'php' },
  Ruby: { accent: '#cc342d', iconKind: 'solid', iconName: 'gem' },
  Swift: { accent: '#f05138', iconKind: 'brand', iconName: 'swift' },
  Kotlin: { accent: '#7f52ff', iconKind: 'solid', iconName: 'code' },
  Scala: { accent: '#dc322f', iconKind: 'solid', iconName: 'diagram-project' },
  R: { accent: '#276dc3', iconKind: 'solid', iconName: 'chart-line' },
  Dart: { accent: '#0175c2', iconKind: 'solid', iconName: 'bullseye' },
  Lua: { accent: '#000080', iconKind: 'solid', iconName: 'moon' },
  Perl: { accent: '#39457e', iconKind: 'solid', iconName: 'keyboard' },
  Shell: { accent: '#4eaa25', iconKind: 'solid', iconName: 'terminal' },
  PowerShell: { accent: '#5391fe', iconKind: 'solid', iconName: 'window-maximize' },
  SQL: { accent: '#336791', iconKind: 'solid', iconName: 'database' },
  CSS: { accent: '#1572b6', iconKind: 'brand', iconName: 'css3-alt' },
  SCSS: { accent: '#cf649a', iconKind: 'brand', iconName: 'sass' },
  Sass: { accent: '#cf649a', iconKind: 'brand', iconName: 'sass' },
  Less: { accent: '#1d365d', iconKind: 'brand', iconName: 'less' },
  JSON: { accent: '#eab308', iconKind: 'solid', iconName: 'file-lines' },
  YAML: { accent: '#cb171e', iconKind: 'solid', iconName: 'indent' },
  XML: { accent: '#f97316', iconKind: 'solid', iconName: 'code' },
  Markdown: { accent: '#083fa1', iconKind: 'brand', iconName: 'markdown' },
  MDX: { accent: '#1b1f24', iconKind: 'brand', iconName: 'markdown' },
  reStructuredText: { accent: '#0a507a', iconKind: 'solid', iconName: 'align-left' },
  TeX: { accent: '#008080', iconKind: 'solid', iconName: 'subscript' },
  Terraform: { accent: '#7b42bc', iconKind: 'solid', iconName: 'cloud' },
  HCL: { accent: '#844fba', iconKind: 'solid', iconName: 'cube' },
  INI: { accent: '#6b7280', iconKind: 'solid', iconName: 'sliders' },
  TOML: { accent: '#9c4221', iconKind: 'solid', iconName: 'list' },
  Config: { accent: '#475569', iconKind: 'solid', iconName: 'gear' },
  Properties: { accent: '#78716c', iconKind: 'solid', iconName: 'list-ul' },
  GraphQL: { accent: '#e10098', iconKind: 'solid', iconName: 'diagram-project' },
  SVG: { accent: '#ffb13b', iconKind: 'solid', iconName: 'image' },
  WebAssembly: { accent: '#654ff0', iconKind: 'solid', iconName: 'microchip' },
  Dockerfile: { accent: '#2496ed', iconKind: 'brand', iconName: 'docker' },
  Makefile: { accent: '#427819', iconKind: 'solid', iconName: 'hammer' },
  CMake: { accent: '#064f8c', iconKind: 'solid', iconName: 'wrench' },
  Other: { accent: '#94a3b8', iconKind: 'solid', iconName: 'circle-question' },
}

export function getRepoLanguageVisual(language: string): RepoLangVisual {
  return LANG_VISUAL[language] ?? DEFAULT_VISUAL
}

export function repoLangRowStyle(accent: string): CSSProperties {
  return { '--lang-accent': accent } as CSSProperties
}

export function RepoLanguageIcon({ language, className = '' }: { language: string; className?: string }) {
  const v = getRepoLanguageVisual(language)
  if (v.iconKind === 'brand') {
    return <FaBrand name={v.iconName} className={className} style={{ color: v.accent }} />
  }
  return <FaIcon name={v.iconName} className={className} style={{ color: v.accent }} />
}

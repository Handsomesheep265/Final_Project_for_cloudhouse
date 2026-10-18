/**
 * 内联 SVG 图标集
 * ----------------------------------------------------------------------------
 * 全部使用 currentColor 描边，颜色由父级 CSS 控制；
 * 统一为 24x24 视口，通过 size 属性调整尺寸，避免额外引入图标库。
 */
import type { ComponentType, ReactNode, SVGProps } from 'react'

const ICON_BASE = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
} as const

/** 所有图标共用的 props */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
}

/** 图标组件类型，供导航配置等场景声明 */
export type IconComponent = ComponentType<IconProps>

interface SvgProps extends IconProps {
  children: ReactNode
}

function Svg({ size = 20, children, ...rest }: SvgProps) {
  return (
    <svg width={size} height={size} {...ICON_BASE} {...rest}>
      {children}
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </Svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  )
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.1M12 19.1v2.1M4.6 4.6l1.5 1.5M17.9 17.9l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.6 19.4l1.5-1.5M17.9 6.1l1.5-1.5" />
    </Svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.4 14.3A8.5 8.5 0 0 1 9.7 3.6 8.6 8.6 0 1 0 20.4 14.3Z" />
    </Svg>
  )
}

export function CartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4h2.1l2.2 10.5a1.8 1.8 0 0 0 1.8 1.4h7.6a1.8 1.8 0 0 0 1.8-1.4L20 7.3H6" />
      <circle cx="9.6" cy="19.4" r="1.3" />
      <circle cx="17.4" cy="19.4" r="1.3" />
    </Svg>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.6 12 4l8 6.6V19a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 19Z" />
      <path d="M9.6 20.4v-6.2h4.8v6.2" />
    </Svg>
  )
}

export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.4" r="3.7" />
      <path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0" />
    </Svg>
  )
}

export interface HeartIconProps extends IconProps {
  filled?: boolean
}

export function HeartIcon({ filled = false, ...props }: HeartIconProps) {
  return (
    <Svg {...props} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7.6-4.5-7.6-9.4A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.6 2.9C19.6 15.5 12 20 12 20Z" />
    </Svg>
  )
}

export function StarIcon({ size = 12, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 3.4l2.65 5.4 5.95.86-4.3 4.2 1.01 5.93L12 16.98l-5.31 2.81 1.01-5.93-4.3-4.2 5.95-.86Z" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5.4v13.2M5.4 12h13.2" />
    </Svg>
  )
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.4 12h13.2" />
    </Svg>
  )
}

export function SparklesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6l1.7 4.3 4.3 1.7-4.3 1.7-1.7 4.3-1.7-4.3L6 9.6l4.3-1.7Z" />
      <path d="M18.4 15.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
    </Svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.4V9h-4.6" />
    </Svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9.5 6 5.5 6-5.5" />
    </Svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  )
}

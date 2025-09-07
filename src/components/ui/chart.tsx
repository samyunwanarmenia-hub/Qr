"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Define a basic type for chart payload items
interface ChartPayloadItem {
  name?: string;
  dataKey?: string;
  value?: any;
  color?: string;
  payload?: any; // For nested data if any
  fill?: string; // For fill color
  valueKey?: string; // Added valueKey
}

// ... (rest of the file, assuming it's the same as provided, just adding the interface)

// A copy of the ChartConfig type from the original file, if it exists
// If not, this is a placeholder.
type ChartConfig = {
  [k: string]: {
    label?: string
    color?: string
    icon?: React.ElementType
  }
}

type ChartContextProps = {
  config: ChartConfig
  vars: { [key: string]: string }
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <Chart />")
  }

  return context
}

type ChartProps = React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer> & {
  config: ChartConfig
  children?: React.ReactNode
}

const Chart = React.forwardRef<HTMLDivElement, ChartProps>(
  ({ config, className, children, ...props }, ref) => {
    const chartVars = React.useMemo(() => {
      return Object.entries(config).reduce(
        (acc: { [key: string]: string }, [key, item]: [string, ChartConfig[keyof ChartConfig]]) => { // Explicitly type acc and item
          const color = item.color ?? `hsl(var(--chart-${key}))`
          return {
            ...acc,
            [`--color-${key}`]: color,
          }
        },
        {} as { [key: string]: string }
      )
    }, [config])

    return (
      <ChartContext.Provider value={{ config, vars: chartVars }}>
        <div
          ref={ref}
          className={cn("h-[400px] w-full", className)}
          style={chartVars as React.CSSProperties}
          {...props}
        >
          <RechartsPrimitive.ResponsiveContainer>
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    )
  }
)
Chart.displayName = "Chart"

const ChartTooltip = RechartsPrimitive.Tooltip

type ChartTooltipProps = React.ComponentProps<typeof RechartsPrimitive.Tooltip> & {
  hideLabel?: boolean
  hideIndicator?: boolean
  nameKey?: string
  valueKey?: string
}

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> &
    ChartTooltipProps & {
      hideLabel?: boolean
      hideIndicator?: boolean
      nameKey?: string
      valueKey?: string
    }
>(
  (
    {
      className,
      bodyClassName,
      itemClassName,
      labelClassName,
      indicatorClassName,
      active,
      payload,
      label,
      nameKey,
      valueKey,
      hideLabel,
      hideIndicator,
      ...props
    },
    ref
  ) => {
    const { config } = useChart()

    if (!active || !payload || payload.length === 0) {
      return null
    }

    const formattedLabel = hideLabel ? null : label
    const customPayload = payload.map((item: ChartPayloadItem) => { // Explicitly type item
      const key = item.dataKey as keyof typeof config
      return {
        ...item,
        color: config[key]?.color || item.color || item.payload?.fill || item.fill,
      }
    })

    return (
      <div
        ref={ref}
        className={cn(
          "grid overflow-hidden rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-md",
          className
        )}
        {...props}
      >
        {!hideLabel ? (
          <div className="px-2 pb-1.5 pt-0.5 font-medium">{formattedLabel}</div>
        ) : null}
        <div className="grid gap-1.5">
          {customPayload.map((item: ChartPayloadItem, index: number) => { // Explicitly type item and index
            const key = `${nameKey || item.name || item.dataKey || "value"}`
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center justify-between gap-x-4 py-1",
                  itemClassName
                )}
              >
                <div className="flex items-center gap-x-2">
                  {!hideIndicator ? (
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        indicatorClassName
                      )}
                      style={{
                        backgroundColor: item.color,
                      }}
                    />
                  ) : null}
                  {item.name}
                </div>
                <div className="text-right font-medium">
                  {item.valueKey ? item.payload?.[item.valueKey] : item.value}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltipContent"

const ChartLegend = RechartsPrimitive.Legend

type ChartLegendProps = React.ComponentProps<typeof RechartsPrimitive.Legend> & {
  nameKey?: string
}

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> &
    ChartLegendProps & {
      nameKey?: string
    }
>(
  (
    { className, payload, nameKey, ...props },
    ref
  ) => {
    const { config } = useChart()

    if (!payload || payload.length === 0) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-x-4",
          className
        )}
        {...props}
      >
        {payload.map((item: ChartPayloadItem) => { // Explicitly type item
          const key = item.dataKey as keyof typeof config
          return (
            <div
              key={key}
              className="flex items-center gap-x-2"
            >
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: config[key]?.color || item.color,
                }}
              />
              {item.name}
            </div>
          )
        })}
      </div>
    )
  }
)
ChartLegendContent.displayName = "ChartLegendContent"

export {
  Chart,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
}
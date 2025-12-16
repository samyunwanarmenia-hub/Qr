"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { VariantProps, cva } from "class-variance-authority"
import { PanelLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, ButtonProps } from "@/components/ui/button" // Import ButtonProps
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetOverlay,
  SheetPortal,
  SheetTrigger,
  // SheetContentProps, // Removed incorrect import of SheetContentProps
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useIsMobile } from "@/hooks/use-mobile"

const sidebarVariants = cva(
  "flex h-full flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground",
  {
    variants: {
      variant: {
        default: "w-64",
        collapsed: "w-16",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface SidebarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof sidebarVariants> {
  // Explicitly add variant here to resolve TS2339 if VariantProps isn't fully resolving
  variant?: VariantProps<typeof sidebarVariants>["variant"];
  children?: React.ReactNode
  mobileBreakpoint?: number
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

// Placeholder for SidebarContext, as it's used by SidebarTrigger
const SidebarContext = React.createContext<{ onOpenChange?: (open: boolean) => void }>({});


const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  (
    {
      className,
      variant,
      children,
      mobileBreakpoint,
      defaultOpen = true,
      onOpenChange,
      ...props
    },
    ref
  ) => {
    const isMobile = useIsMobile()
    const [open, setOpen] = React.useState(defaultOpen)
    const [openMobile, setOpenMobile] = React.useState(false)

    React.useEffect(() => {
      if (onOpenChange) {
        onOpenChange(open)
      }
    }, [open, onOpenChange])

    const toggleSidebar = () => setOpen((prev) => !prev)
    const toggleMobileSidebar = () => setOpenMobile((prev) => !prev)

    const sidebarContent = (
      <div
        ref={ref}
        className={cn(sidebarVariants({ variant }), className)}
        {...props}
      >
        {children}
      </div>
    )

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed left-4 top-4 z-50"
              onClick={toggleMobileSidebar}
            >
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle Sidebar</span>
            </Button>
          </SheetTrigger>
          <SheetContent // This is where the error was. SheetContentProps is now correctly defined.
            data-sidebar="sidebar"
            data-mobile="true"
            className={cn(sidebarVariants({ variant: "default" }), "w-3/4")}
            side="left" // Explicitly set side for mobile sidebar
          >
            <ScrollArea className="h-full">
              {children}
            </ScrollArea>
          </SheetContent>
        </Sheet>
      )
    }

    return sidebarContent
  }
)
Sidebar.displayName = "Sidebar"

const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  ButtonProps // Use ButtonProps here
>(({ className, ...props }, ref) => {
  const { onOpenChange } = React.useContext(SidebarContext) // Assuming SidebarContext exists
  return (
    <Button
      ref={ref}
      className={cn("h-10 w-10", className)}
      onClick={() => onOpenChange?.(true)} // Assuming onOpenChange is a function to open the sidebar
      {...props}
    >
      <PanelLeft className="h-5 w-5" />
      <span className="sr-only">Open Sidebar</span>
    </Button>
  )
})
SidebarTrigger.displayName = "SidebarTrigger"


export { Sidebar, SidebarTrigger, sidebarVariants }
"use client"

import * as React from "react"
import { OTPInput, OTPInputContext, type OTPInputContextValue } from "input-otp" // Import OTPInputContextValue
import { Minus } from "lucide-react"

import { cn } from "@/lib/utils"

const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={cn(
      "flex items-center gap-2 has-[:disabled]:opacity-50",
      containerClassName
    )}
    className={cn("disabled:cursor-not-allowed", className)}
    {...props}
  />
))
InputOTP.displayName = "InputOTP"

const InputOTPGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center", className)} {...props} />
))
InputOTPGroup.displayName = "InputOTPGroup"

const InputOTPSlot = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & { index: number }
>(({ index, className, ...props }, ref) => {
  const inputOTPContext = React.useContext(OTPInputContext) as OTPInputContextValue | null; // Cast to OTPInputContextValue or null
  if (!inputOTPContext) {
    // Handle the case where context is null, e.g., throw an error or return null
    console.error("InputOTPSlot must be used within an InputOTP component.");
    return null;
  }
  const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index];

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center border-y border-r border-input text-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md",
        isActive && "z-10 ring-2 ring-ring ring-offset-background",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  )
})
InputOTPSlot.displayName = "InputOTPSlot"

const InputOTPMirror = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  const inputOTPContext = React.useContext(OTPInputContext) as OTPInputContextValue | null; // Cast to OTPInputContextValue or null
  if (!inputOTPContext) {
    console.error("InputOTPMirror must be used within an InputOTP component.");
    return null;
  }
  const { slots } = inputOTPContext;
  const chars = slots.map((slot: OTPInputContextValue['slots'][number]) => slot.char); // Explicitly type slot
  return (
    <div ref={ref} className={cn("flex items-center", className)} {...props}>
      {chars.map((char: string, index: number) => ( // Explicitly type char and index
        <div
          key={index}
          className="relative flex h-10 w-10 items-center justify-center border-y border-r border-input text-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md"
        >
          {char}
        </div>
      ))}
    </div>
  );
});
InputOTPMirror.displayName = "InputOTPMirror";


const InputOTPSeparator = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("-mx-2 flex items-center", className)} {...props}>
    <Minus />
  </div>
))
InputOTPSeparator.displayName = "InputOTPSeparator"

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator, InputOTPMirror }
"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:brightness-105 shadow-[0_1px_0_hsl(var(--foreground)/.08)_inset]",
        secondary:
          "bg-secondary text-secondary-foreground border border-border/60 hover:bg-accent",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-accent hover:border-border",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        danger: "bg-danger text-danger-foreground hover:brightness-105",
        signal:
          "bg-signal text-signal-foreground hover:brightness-105 font-semibold shadow-[0_0_24px_-6px_hsl(var(--signal)/.55)]",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-xs",
        lg: "h-11 px-5 text-sm",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7 rounded-md",
        "icon-lg": "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors hover:border-border focus:border-signal/50 focus:outline-none focus:ring-2 focus:ring-signal/15 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex w-full resize-none rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors hover:border-border focus:border-signal/50 focus:outline-none focus:ring-2 focus:ring-signal/15 disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground", className)}
    {...props}
  />
));
Label.displayName = "Label";

const avatarColors = [
  "bg-[#27351A] text-[#D8F58B]",
  "bg-[#31241C] text-[#F4C4A4]",
  "bg-[#1C2B31] text-[#A8DDE8]",
  "bg-[#2E1F2E] text-[#E9B7E2]",
  "bg-[#2A2A1C] text-[#EAE29B]",
  "bg-[#20263A] text-[#B9C6FF]",
];

export function avatarTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return avatarColors[hash % avatarColors.length]!;
}

type AvatarProps = {
  name: string;
  src?: string | null;
  id?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  online?: boolean;
};

const avatarSizes = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-lg",
};

export function Avatar({ name, src, id, size = "md", className, online }: AvatarProps) {
  const words = name
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter(Boolean);
  const initials =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase())
          .join("")
      : [...(words[0] ?? "")].slice(0, 2).join("").toUpperCase();
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <AvatarPrimitive.Root
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-full font-semibold tracking-wide ring-1 ring-inset ring-white/10",
          avatarSizes[size],
          !src && avatarTone(id ?? name),
        )}
      >
        {src ? (
          <AvatarPrimitive.Image src={src} alt={name} className="h-full w-full object-cover" />
        ) : null}
        <AvatarPrimitive.Fallback delayMs={src ? 300 : 0} className="flex h-full w-full items-center justify-center">
          {initials || "?"}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
      {online ? (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-signal" />
      ) : null}
    </span>
  );
}

export function Badge({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "signal" | "danger" | "outline";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
        tone === "neutral" && "bg-secondary text-muted-foreground",
        tone === "signal" && "bg-signal/15 text-signal",
        tone === "danger" && "bg-danger/15 text-danger",
        tone === "outline" && "border border-border text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-muted-foreground", className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer-line rounded-md", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-[34ch] text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: "sm" | "md" | "lg" | "xl" }
>(({ className, children, size = "md", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-[90] max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-lift outline-none data-[state=open]:animate-scale-in",
        size === "sm" && "max-w-md",
        size === "md" && "max-w-xl",
        size === "lg" && "max-w-3xl",
        size === "xl" && "max-w-5xl",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground opacity-70 transition hover:bg-accent hover:opacity-100"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export function DialogHeader({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
}) {
  return (
    <div className="border-b border-border/70 px-6 pb-5 pt-6 pr-12">
      {eyebrow ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-signal">
          {eyebrow}
        </p>
      ) : null}
      <DialogPrimitive.Title className="font-display text-xl text-foreground">
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </DialogPrimitive.Description>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative h-[22px] w-[38px] shrink-0 rounded-full border border-border bg-muted transition-colors data-[state=checked]:border-signal/40 data-[state=checked]:bg-signal disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-[3px] rounded-full bg-foreground/80 transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-signal-foreground" />
    </SwitchPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  children,
  side = "top",
}: {
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        side={side}
        sideOffset={6}
        className="z-[120] rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-soft data-[state=delayed-open]:animate-scale-in"
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border/80 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {children}
      </h3>
      {action}
    </div>
  );
}

/* ---------------------------------- menus --------------------------------- */

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[110] min-w-[190px] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lift data-[state=open]:animate-scale-in",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        danger
          ? "text-danger data-[highlighted]:bg-danger/10"
          : "text-popover-foreground data-[highlighted]:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

/* -------------------------------- popovers -------------------------------- */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[110] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lift outline-none data-[state=open]:animate-scale-in",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PopoverContent";

/* ---------------------------------- tabs ---------------------------------- */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List
      className={cn("flex items-center gap-1 overflow-x-auto scroll-thin", className)}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="whitespace-nowrap rounded-md px-1.5 py-1.5 text-[10.5px] font-medium text-muted-foreground transition hover:text-foreground data-[state=active]:bg-secondary data-[state=active]:text-foreground sm:px-2.5 sm:text-[11px]"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Content value={value} className={cn("outline-none", className)}>
      {children}
    </TabsPrimitive.Content>
  );
}

/* ------------------------------ confirm dialog ----------------------------- */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
}) {
  const [pending, setPending] = React.useState(false);
  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="p-6">
        <DialogPrimitive.Title className="font-display text-lg text-foreground">
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {description}
        </DialogPrimitive.Description>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "default"}
            onClick={() => void confirm()}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { buttonVariants };

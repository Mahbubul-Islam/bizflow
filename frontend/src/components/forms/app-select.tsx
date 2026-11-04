"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { value: string; label: string; disabled?: boolean };
type Props = {
  options: Option[];
  placeholder: string;
  name?: string;
  id?: string;
  ariaLabel?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

export function AppSelect({ options, placeholder, name, id, ariaLabel, value, defaultValue, onValueChange, required, disabled, className }: Props) {
  return <Select<string>
    name={name}
    items={options.map((option) => ({ value: option.value || null, label: option.label }))}
    {...(value === undefined ? { defaultValue: defaultValue || null } : { value: value || null })}
    onValueChange={onValueChange ? (next) => onValueChange(next ?? "") : undefined}
    required={required}
    disabled={disabled}
  >
    <SelectTrigger id={id} aria-label={ariaLabel} className={className ?? "w-full"}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => <SelectItem key={option.value} value={option.value || null} disabled={option.disabled}>{option.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}

import { Check, Circle } from "lucide-react";

interface DonationProcessProps {
  receiptConfirmed: boolean;
  thankYouSent: boolean;
  onToggleReceipt?: () => void;
  onToggleThankYou?: () => void;
  readOnly?: boolean;
}

export function DonationProcess({
  receiptConfirmed,
  thankYouSent,
  onToggleReceipt,
  onToggleThankYou,
  readOnly,
}: DonationProcessProps) {
  const steps = [
    {
      label: "התקבלה קבלה",
      checked: receiptConfirmed,
      onToggle: onToggleReceipt,
    },
    {
      label: "נשלח מכתב תודה",
      checked: thankYouSent,
      onToggle: onToggleThankYou,
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        marginTop: "8px",
      }}
    >
      {steps.map((step) => (
        <button
          key={step.label}
          onClick={readOnly ? undefined : step.onToggle}
          disabled={readOnly && !step.onToggle}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 10px",
            borderRadius: "8px",
            border: step.checked
              ? "1.5px solid var(--color-success)"
              : "1.5px solid var(--color-border)",
            background: step.checked
              ? "rgba(34, 197, 94, 0.08)"
              : "transparent",
            cursor: readOnly ? "default" : "pointer",
            fontSize: "12px",
            fontWeight: 500,
            fontFamily: "inherit",
            color: step.checked
              ? "var(--color-success)"
              : "var(--color-text-secondary)",
            transition: "all 0.2s",
          }}
        >
          {step.checked ? (
            <Check size={14} />
          ) : (
            <Circle size={14} />
          )}
          {step.label}
        </button>
      ))}
    </div>
  );
}

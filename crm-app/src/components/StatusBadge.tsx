import { ContactStatus, STATUS_LABELS } from '../types';

interface StatusBadgeProps {
    status: ContactStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
    return (
        <span className={`badge badge-${status.replace('_', '-')}`}>
            {STATUS_LABELS[status]}
        </span>
    );
}

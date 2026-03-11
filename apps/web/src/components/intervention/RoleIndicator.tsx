/**
 * Role Indicator Component
 * Displays the current user's role and permissions in the intervention session
 */

import { useMemo } from 'react';
import type { InterventionRole } from './types';

interface RoleIndicatorProps {
  role: InterventionRole;
  showPermissions?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const ROLE_CONFIG: Record<InterventionRole, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  description: string;
}> = {
  observer: {
    label: 'Observer',
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10',
    borderColor: 'border-slate-400/30',
    icon: '👁',
    description: 'View conversations only',
  },
  participant: {
    label: 'Participant',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
    icon: '💬',
    description: 'Send messages and request clarification',
  },
  moderator: {
    label: 'Moderator',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-400/10',
    borderColor: 'border-yellow-400/30',
    icon: '🛡',
    description: 'Guide and manage conversations',
  },
  admin: {
    label: 'Admin',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/30',
    icon: '👑',
    description: 'Full control over conversations',
  },
};

const ROLE_PERMISSIONS_LIST: Record<InterventionRole, string[]> = {
  observer: ['View conversations'],
  participant: ['View conversations', 'Send messages', 'Request clarification'],
  moderator: [
    'View conversations',
    'Send messages',
    'Request clarification',
    'Pause/Resume',
    'Redirect',
    'Approve/Reject',
  ],
  admin: [
    'View conversations',
    'Send messages',
    'Request clarification',
    'Pause/Resume',
    'Redirect',
    'Approve/Reject',
    'Terminate',
  ],
};

const SIZE_CONFIG = {
  sm: {
    badge: 'px-2 py-0.5 text-xs',
    icon: 'text-sm',
  },
  md: {
    badge: 'px-3 py-1 text-sm',
    icon: 'text-base',
  },
  lg: {
    badge: 'px-4 py-1.5 text-base',
    icon: 'text-lg',
  },
};

export function RoleIndicator({
  role,
  showPermissions = false,
  size = 'md',
  className = '',
}: RoleIndicatorProps) {
  const config = ROLE_CONFIG[role];
  const sizeConfig = SIZE_CONFIG[size];

  const permissionsList = useMemo(() => {
    return ROLE_PERMISSIONS_LIST[role];
  }, [role]);

  return (
    <div className={`inline-flex flex-col gap-2 ${className}`}>
      {/* Role Badge */}
      <div
        className={`
          inline-flex items-center gap-2 rounded-full border
          ${config.bgColor} ${config.borderColor} ${config.color}
          ${sizeConfig.badge}
        `}
      >
        <span className={sizeConfig.icon}>{config.icon}</span>
        <span className="font-medium">{config.label}</span>
      </div>

      {/* Description */}
      {showPermissions && (
        <div className="text-sm text-slate-500">
          <p className="mb-2">{config.description}</p>
          <ul className="space-y-1">
            {permissionsList.map((permission, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                <span className="text-slate-400">{permission}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Compact role badge for inline use
 */
export function RoleBadge({
  role,
  className = '',
}: {
  role: InterventionRole;
  className?: string;
}) {
  const config = ROLE_CONFIG[role];

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
        ${config.bgColor} ${config.color}
        ${className}
      `}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

/**
 * Permission indicator showing which actions are available
 */
export function PermissionIndicator({
  role,
  action,
  className = '',
}: {
  role: InterventionRole;
  action: string;
  className?: string;
}) {
  const hasPermission = ROLE_PERMISSIONS_LIST[role].some(
    p => p.toLowerCase().includes(action.toLowerCase())
  );

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {hasPermission ? (
        <span className="text-green-400 text-xs">Allowed</span>
      ) : (
        <span className="text-slate-500 text-xs">Not allowed</span>
      )}
    </span>
  );
}
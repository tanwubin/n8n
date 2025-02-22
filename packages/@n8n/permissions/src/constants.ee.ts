export const DEFAULT_OPERATIONS = ['create', 'read', 'update', 'delete', 'list'] as const;
export const RESOURCES = {
	annotationTag: [...DEFAULT_OPERATIONS] as const,
	auditLogs: ['manage'] as const,
	banner: ['dismiss'] as const,
	community: ['register'] as const,
	communityPackage: ['install', 'uninstall', 'update', 'list', 'manage'] as const,
	credential: ['share', 'move', ...DEFAULT_OPERATIONS] as const,
	externalSecretsProvider: ['sync', ...DEFAULT_OPERATIONS] as const,
	externalSecret: ['list', 'use'] as const,
	eventBusDestination: ['test', ...DEFAULT_OPERATIONS] as const,
	ldap: ['sync', 'manage'] as const,
	license: ['manage'] as const,
	logStreaming: ['manage'] as const,
	orchestration: ['read', 'list'] as const,
	project: [...DEFAULT_OPERATIONS] as const,
	saml: ['manage'] as const,
	securityAudit: ['generate'] as const,
	sourceControl: ['pull', 'push', 'manage'] as const,
	tag: [...DEFAULT_OPERATIONS] as const,
	user: ['resetPassword', 'changeRole', ...DEFAULT_OPERATIONS] as const,
	variable: [...DEFAULT_OPERATIONS] as const,
	workersView: ['manage'] as const,
	workflow: ['share', 'execute', 'move', ...DEFAULT_OPERATIONS] as const,
	folder: ['create'] as const,
} as const;

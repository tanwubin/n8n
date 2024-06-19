import { Factory } from 'miragejs';
import type { ICredentialType } from 'n8n-workflow/Interfaces';

const credentialTypes = [
	'airtableApi',
	'dropboxApi',
	'figmaApi',
	'googleApi',
	'gitlabApi',
	'jenkinsApi',
	'metabaseApi',
	'notionApi',
];

export const credentialTypeFactory = Factory.extend<ICredentialType>({
	name(i) {
		return credentialTypes[i];
	},
	displayName(i) {
		return credentialTypes[i];
	},
	properties() {
		return [];
	},
});

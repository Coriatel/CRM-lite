// Google Contacts API Integration

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/contacts.readonly';

interface GoogleContact {
    resourceName: string;
    names?: Array<{
        displayName?: string;
        givenName?: string;
        familyName?: string;
    }>;
    phoneNumbers?: Array<{
        value: string;
        type?: string;
    }>;
    emailAddresses?: Array<{
        value: string;
        type?: string;
    }>;
}

export interface ParsedGoogleContact {
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    phone1: string;
    phone2: string;
    email: string;
}

let tokenClient: any = null;
let accessToken: string | null = null;

export function initGoogleAuth() {
    return new Promise<void>((resolve, reject) => {
        // Load Google Identity Services library
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            console.log('Google Identity Services loaded');
            resolve();
        };
        script.onerror = () => {
            reject(new Error('Failed to load Google Identity Services'));
        };
        document.head.appendChild(script);
    });
}

export function requestGoogleAuth(): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!GOOGLE_CLIENT_ID) {
            reject(new Error('Google Client ID not configured'));
            return;
        }

        // @ts-ignore - Google Identity Services
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: (response: any) => {
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }
                accessToken = response.access_token;
                if (accessToken) {
                    resolve(accessToken);
                } else {
                    reject(new Error('No access token received'));
                }
            },
        });

        tokenClient.requestAccessToken();
    });
}

export async function fetchGoogleContacts(): Promise<ParsedGoogleContact[]> {
    if (!accessToken) {
        throw new Error('Not authenticated with Google');
    }

    try {
        const response = await fetch(
            'https://people.googleapis.com/v1/people/me/connections?' +
            new URLSearchParams({
                personFields: 'names,phoneNumbers,emailAddresses',
                pageSize: '1000',
                sortOrder: 'LAST_NAME_ASCENDING'
            }),
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Google API error: ${response.statusText}`);
        }

        const data = await response.json();
        const connections: GoogleContact[] = data.connections || [];

        return connections.map(contact => parseGoogleContact(contact)).filter(c => c.fullName);
    } catch (error) {
        console.error('Error fetching Google contacts:', error);
        throw error;
    }
}

function parseGoogleContact(contact: GoogleContact): ParsedGoogleContact {
    const name = contact.names?.[0];
    const phones = contact.phoneNumbers || [];
    const emails = contact.emailAddresses || [];

    const firstName = name?.givenName || '';
    const lastName = name?.familyName || '';
    const fullName = name?.displayName || `${firstName} ${lastName}`.trim();

    return {
        id: contact.resourceName,
        fullName,
        firstName,
        lastName,
        phone1: phones[0]?.value || '',
        phone2: phones[1]?.value || '',
        email: emails[0]?.value || '',
    };
}

export function disconnectGoogle() {
    accessToken = null;
    tokenClient = null;
}

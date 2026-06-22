const fetch = require('node-fetch');

/**
 * Uses SerpAPI to "Google" the company name and intelligently
 * extract their official website domain.
 */
async function getDomainFromCompany(company, serpApiKey) {
    if (!serpApiKey) throw new Error('SerpAPI key missing for domain lookup.');
    
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('q', company + ' official website');
    url.searchParams.set('api_key', serpApiKey);
    url.searchParams.set('num', '5'); // check top 5 results

    const res = await fetch(url).then(r => r.json());
    if (res.organic_results && res.organic_results.length > 0) {
        for (let r of res.organic_results) {
            try {
                let domain = new URL(r.link).hostname.replace('www.', '');
                // Ignore popular directories/social media
                const ignored = ['linkedin.com', 'facebook.com', 'twitter.com', 'crunchbase.com', 'instagram.com', 'glassdoor.com', 'indeed.com'];
                if (!ignored.some(ign => domain.includes(ign))) {
                    return domain;
                }
            } catch (e) {}
        }
    }
    throw new Error('Could not find a valid company domain.');
}

/**
 * Generates an OAuth2 access token for Snov.io
 */
async function getSnovToken(clientId, clientSecret) {
    const response = await fetch('https://api.snov.io/v1/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        })
    });

    if (!response.ok) {
        throw new Error('Failed to authenticate with Snov.io API');
    }

    const data = await response.json();
    return data.access_token;
}

/**
 * Snov.io API contact fetcher.
 * Replaces Apollo by dynamically fetching the domain, then querying Snov.io for the email.
 */
async function fetchContactFromSnov(name, company, clientId, clientSecret, serpApiKey) {
    if (!clientId || !clientSecret) {
        throw new Error('Snov.io API credentials are missing.');
    }
    if (!name || !company) {
        throw new Error('Name and company are required to perform a Snov.io search.');
    }

    try {
        // Step 1: Find the company's domain
        const domain = await getDomainFromCompany(company, serpApiKey);
        console.log(`[Snov.io] Extracted domain "${domain}" for company "${company}"`);

        // Step 2: Get Snov.io Access Token
        const token = await getSnovToken(clientId, clientSecret);

        // Split name into first and last
        const nameParts = name.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Step 3: Call Email Finder API
        const response = await fetch('https://api.snov.io/v1/get-emails-from-names', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                firstName: firstName,
                lastName: lastName,
                domain: domain
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Snov.io API error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        
        // Snov returns an array of emails if successful
        if (data.status === 'success' && data.data && data.data.emails && data.data.emails.length > 0) {
            // grab the most confident email
            const bestEmail = data.data.emails[0].email;
            return {
                email: bestEmail,
                phone: '' // Snov.io email finder usually doesn't return phone numbers on this endpoint
            };
        }

        // Return empty if no match found
        return { email: '', phone: '' };

    } catch (error) {
        console.error('Error in fetchContactFromSnov:', error);
        throw error;
    }
}

/**
 * Hunter.io API contact fetcher.
 */
async function fetchContactFromHunter(name, company, apiKey, serpApiKey) {
    if (!apiKey) {
        throw new Error('Hunter.io API key is missing.');
    }
    if (!name || !company) {
        throw new Error('Name and company are required to perform a Hunter.io search.');
    }

    try {
        // Step 1: Find the company's domain using SerpAPI
        const domain = await getDomainFromCompany(company, serpApiKey);
        console.log(`[Hunter.io] Extracted domain "${domain}" for company "${company}"`);

        // Split name into first and last
        const nameParts = name.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Step 2: Call Hunter Email Finder API
        const url = new URL('https://api.hunter.io/v2/email-finder');
        url.searchParams.set('domain', domain);
        url.searchParams.set('first_name', firstName);
        url.searchParams.set('last_name', lastName);
        url.searchParams.set('api_key', apiKey);

        const response = await fetch(url.toString());

        if (response.status === 404) {
            console.log(`[Hunter.io] No email found for ${name} at ${domain}`);
            return { email: '', phone: '' };
        }

        if (response.status === 429 || response.status === 403) {
            console.warn(`[Hunter.io] Rate or Usage limit reached (HTTP ${response.status}).`);
            throw new Error('HUNTER_LIMIT_REACHED');
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Hunter.io API error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        
        if (data.data && data.data.email) {
            return {
                email: data.data.email,
                phone: data.data.phone_number || '' 
            };
        }

        return { email: '', phone: '' };

    } catch (error) {
        console.error('Error in fetchContactFromHunter:', error);
        throw error;
    }
}

module.exports = { fetchContactFromSnov, fetchContactFromHunter };

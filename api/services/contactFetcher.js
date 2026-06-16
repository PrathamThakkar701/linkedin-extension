const fetch = require('node-fetch');

/**
 * Apollo API contact fetcher.
 * Uses the Apollo people/match endpoint to find a work email based on name and company.
 */
async function fetchContactFromApollo(name, company, apiKey) {
    if (!apiKey) {
        throw new Error('Apollo API key is missing.');
    }
    
    // Apollo is very strict about having at least a name and company
    if (!name || !company) {
        throw new Error('Name and company are required to perform an Apollo search.');
    }

    // Split name into first and last
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    try {
        const response = await fetch('https://api.apollo.io/v1/people/match', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': apiKey
            },
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                organization_name: company
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Apollo API error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        
        if (data.person && data.person.email) {
            return {
                email: data.person.email,
                // Some profiles have multiple phone numbers, grab the first valid one
                phone: data.person.phone_numbers && data.person.phone_numbers.length > 0
                    ? data.person.phone_numbers[0].sanitized_number || data.person.phone_numbers[0].raw_number 
                    : ''
            };
        }

        // Return empty if no match found
        return { email: '', phone: '' };

    } catch (error) {
        console.error('Error in fetchContactFromApollo:', error);
        throw error;
    }
}

module.exports = { fetchContactFromApollo };

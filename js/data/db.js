// Cliente para llamadas a Supabase (reemplaza IndexedDB)
import { API_CONFIG } from '../core/config.js';

export async function supabaseFetch(endpoint, method = 'GET', body = null) {
    const headers = {
        'apikey': API_CONFIG.SUPABASE_KEY,
        'Authorization': `Bearer ${API_CONFIG.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${API_CONFIG.SUPABASE_URL}/rest/v1/${endpoint}`, options);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Error HTTP: ${response.status}`);
        }
        if (response.status === 204) return null;
        return await response.json();
    } catch (error) {
        console.error(`Error en API (${endpoint}):`, error);
        throw error;
    }
}

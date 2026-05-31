// Security utilities for XSS protection and data sanitization

class SecurityUtils {
    /**
     * Sanitize HTML content to prevent XSS attacks
     */
    static sanitizeHTML(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }

    /**
     * Escape HTML entities
     */
    static escapeHTML(text) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    /**
     * Sanitize CSV content to prevent formula injection
     */
    static sanitizeCSV(text) {
        // Prevent CSV injection by removing formula characters
        const dangerous = /^[\=\+\-\@\t\r]/;
        if (dangerous.test(text)) {
            return `'${text}`;
        }
        return text.replace(/"/g, '""');
    }

    /**
     * Validate and sanitize Reddit post data
     */
    static sanitizePost(post) {
        return {
            id: this.escapeHTML(post.id || ''),
            author: this.escapeHTML(post.author || ''),
            title: this.escapeHTML(post.title || ''),
            selftext: this.escapeHTML(post.selftext || ''),
            subreddit: this.escapeHTML(post.subreddit || ''),
            created_utc: parseInt(post.created_utc) || 0,
            score: parseInt(post.score) || 0,
            num_comments: parseInt(post.num_comments) || 0,
            url: this.escapeHTML(post.url || ''),
            content: this.escapeHTML(`${post.title || ''} ${post.selftext || ''}`.trim())
        };
    }

    /**
     * Encrypt sensitive data for localStorage
     */
    static encrypt(text, key = 'coach-connect-key') {
        try {
            // Simple XOR encryption (better than nothing)
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return btoa(result);
        } catch (error) {
            console.warn('Encryption failed, storing plain text');
            return text;
        }
    }

    /**
     * Decrypt sensitive data from localStorage
     */
    static decrypt(encryptedText, key = 'coach-connect-key') {
        try {
            const text = atob(encryptedText);
            let result = '';
            for (let i = 0; i < text.length; i++) {
                result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            return result;
        } catch (error) {
            console.warn('Decryption failed, returning as-is');
            return encryptedText;
        }
    }

    /**
     * Validate API key format
     */
    static validateApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string') {
            return false;
        }

        // Basic validation - adjust for your API key format
        return apiKey.length > 10 && /^[a-zA-Z0-9\-_]+$/.test(apiKey);
    }

    /**
     * Safe DOM element creation
     */
    static createElement(tag, content, attributes = {}) {
        const element = document.createElement(tag);

        if (content) {
            element.textContent = content; // Safe text content
        }

        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else {
                element.setAttribute(key, this.escapeHTML(String(value)));
            }
        });

        return element;
    }

    /**
     * Rate limiting for API calls
     */
    static createRateLimiter(maxCalls, windowMs) {
        const calls = [];

        return function() {
            const now = Date.now();

            // Remove calls outside the window
            while (calls.length > 0 && calls[0] <= now - windowMs) {
                calls.shift();
            }

            if (calls.length >= maxCalls) {
                throw new Error(`Rate limit exceeded. Max ${maxCalls} calls per ${windowMs}ms`);
            }

            calls.push(now);
            return true;
        };
    }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SecurityUtils;
} else if (typeof window !== 'undefined') {
    window.SecurityUtils = SecurityUtils;
}
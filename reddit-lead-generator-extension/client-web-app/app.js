// Coach Connect Pro - SECURE Client-Side Web Application
// Fixed critical security vulnerabilities and performance issues

class SecureCoachConnectApp {
    constructor() {
        this.prospects = [];
        this.config = {
            apiKey: '',
            subreddits: ['dating', 'confidence', 'socialanxiety', 'dating_advice', 'datingoverthirty', 'datingoverforty', 'relationship_advice', 'relationships', 'lonely', 'ForeverAlone', 'seduction', 'askwomen', 'askmen', 'self', 'getmotivated', 'decidingtobebetter'],
            includeKeywords: [],
            avoidKeywords: [],
            desiredSignals: 'Straight men, dating pain, actively asking for help, likely adult, likely has resources, open to coaching or advice',
            avoidSignals: 'Women, minors, current students, severe debt, suicidal crisis, severe mental health crisis, not looking for dating help, no clear pain point',
            profileContext: false,
            minScore: 7.0,
            maxResults: 10
        };
        this.disqualifiedPostIds = new Set();
        this.rejectedPostIds = new Set();
        this.rejectedAuthors = new Set();
        this.rejectedLeads = [];
        this.currentFilter = 'active';
        this.isAnalyzing = false;
        this.analysisAborted = false;

        // Rate limiters
        this.redditRateLimit = SecurityUtils.createRateLimiter(10, 60000); // 10 calls per minute
        this.aiRateLimit = SecurityUtils.createRateLimiter(20, 60000); // 20 calls per minute

        // Initialize app
        this.initializeSafely();
    }

    /**
     * Safe initialization with error boundaries
     */
    async initializeSafely() {
        try {
            await this.loadConfig();
            this.initializeEventListeners();
            this.updateUI();
            this.showWelcomeMessage();
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Application failed to load. Please refresh the page.');
        }
    }

    /**
     * Show welcome message with legal disclaimer
     */
    showWelcomeMessage() {
        if (!localStorage.getItem('coachConnect_disclaimerShown')) {
            this.showToast(
                'Welcome! Please read our terms and use responsibly. This tool is for legitimate business purposes only.',
                'info',
                8000
            );
            localStorage.setItem('coachConnect_disclaimerShown', 'true');
        }
    }

    // SECURE Configuration Management
    async loadConfig() {
        try {
            const saved = localStorage.getItem('coachConnect_config');
            if (saved) {
                const config = JSON.parse(saved);

                // Decrypt API key if encrypted
                if (config.apiKey) {
                    try {
                        config.apiKey = SecurityUtils.decrypt(config.apiKey);
                    } catch (error) {
                        console.warn('API key decryption failed');
                        config.apiKey = '';
                    }
                }

                // Clean legacy proxy fields from old config
                const cleanConfig = {
                    apiKey: config.apiKey || '',
                    subreddits: config.subreddits || this.config.subreddits,
                    includeKeywords: Array.isArray(config.includeKeywords) ? config.includeKeywords : this.config.includeKeywords,
                    avoidKeywords: Array.isArray(config.avoidKeywords) ? config.avoidKeywords : this.config.avoidKeywords,
                    desiredSignals: config.desiredSignals || this.config.desiredSignals,
                    avoidSignals: config.avoidSignals || this.config.avoidSignals,
                    profileContext: Boolean(config.profileContext),
                    minScore: config.minScore || this.config.minScore,
                    maxResults: config.maxResults || this.config.maxResults
                };
                this.config = { ...this.config, ...cleanConfig };
            }

            const savedDisqualified = localStorage.getItem('coachConnect_disqualifiedPostIds');
            if (savedDisqualified) {
                const ids = JSON.parse(savedDisqualified);
                if (Array.isArray(ids)) {
                    this.disqualifiedPostIds = new Set(ids.filter(id => typeof id === 'string'));
                }
            }

            const savedRejected = localStorage.getItem('coachConnect_rejectedLeads');
            if (savedRejected) {
                const rejected = JSON.parse(savedRejected);
                if (Array.isArray(rejected)) {
                    this.rejectedLeads = rejected.filter(item => item && item.post && item.reason);
                    this.rejectedPostIds = new Set(this.rejectedLeads.map(item => item.post.id).filter(Boolean));
                    this.rejectedAuthors = new Set(this.rejectedLeads.map(item => item.post.author?.toLowerCase()).filter(Boolean));
                    this.disqualifiedPostIds = new Set([...this.disqualifiedPostIds, ...this.rejectedPostIds]);
                }
            }

            const savedProspects = localStorage.getItem('coachConnect_prospects');
            if (savedProspects) {
                this.prospects = JSON.parse(savedProspects);

                // Validate and sanitize loaded prospects
                this.prospects = this.prospects
                    .filter(p => p && p.post && p.analysis)
                    .map(p => ({
                        ...p,
                        post: SecurityUtils.sanitizePost(p.post),
                        message: SecurityUtils.escapeHTML(p.message || ''),
                        saved: Boolean(p.saved),
                        notes: SecurityUtils.escapeHTML(p.notes || ''),
                        status: SecurityUtils.escapeHTML(p.status || 'New'),
                        profileContext: SecurityUtils.escapeHTML(p.profileContext || '')
                    }));
            }
        } catch (error) {
            console.error('Error loading config:', error);
            this.prospects = [];
            this.config = {
                apiKey: '',
                subreddits: ['dating', 'confidence', 'socialanxiety', 'dating_advice', 'datingoverthirty', 'datingoverforty', 'relationship_advice', 'relationships', 'lonely', 'ForeverAlone', 'seduction', 'askwomen', 'askmen', 'self', 'getmotivated', 'decidingtobebetter'],
                includeKeywords: [],
                avoidKeywords: [],
                desiredSignals: 'Straight men, dating pain, actively asking for help, likely adult, likely has resources, open to coaching or advice',
                avoidSignals: 'Women, minors, current students, severe debt, suicidal crisis, severe mental health crisis, not looking for dating help, no clear pain point',
                profileContext: false,
                minScore: 7.0,
                maxResults: 10
            };
        }
    }

    parseKeywordList(text) {
        return String(text || '')
            .split(',')
            .map(keyword => keyword.trim().toLowerCase())
            .filter(Boolean)
            .filter(keyword => keyword.length <= 80);
    }

    saveConfig() {
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        const subreddits = document.getElementById('subredditsInput').value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .filter(s => /^[a-zA-Z0-9_]+$/.test(s)); // Validate subreddit names

        const includeKeywords = this.parseKeywordList(document.getElementById('includeKeywordsInput')?.value || '');
        const avoidKeywords = this.parseKeywordList(document.getElementById('avoidKeywordsInput')?.value || '');
        const desiredSignals = document.getElementById('desiredSignalsInput').value.trim();
        const avoidSignals = document.getElementById('avoidSignalsInput').value.trim();
        const profileContext = Boolean(document.getElementById('profileContextInput')?.checked);
        const minScore = parseFloat(document.getElementById('minScoreInput').value);
        const maxResults = parseInt(document.getElementById('maxResultsInput').value);

        // Validate inputs
        if (!apiKey) {
            this.showToast('Please enter your DeepInfra API key', 'error');
            return;
        }

        if (!SecurityUtils.validateApiKey(apiKey)) {
            this.showToast('Invalid API key format', 'error');
            return;
        }

        if (subreddits.length === 0) {
            this.showToast('Please enter at least one valid subreddit', 'error');
            return;
        }

        if (isNaN(minScore) || minScore < 1 || minScore > 10) {
            this.showToast('Score must be between 1 and 10', 'error');
            return;
        }

        if (isNaN(maxResults) || maxResults < 1 || maxResults > 50) {
            this.showToast('Results must be between 1 and 50', 'error');
            return;
        }

        try {
            // Encrypt API key before storing
            const encryptedApiKey = SecurityUtils.encrypt(apiKey);

            this.config = {
                apiKey: encryptedApiKey,
                subreddits,
                includeKeywords,
                avoidKeywords,
                desiredSignals: desiredSignals || this.config.desiredSignals,
                avoidSignals: avoidSignals || this.config.avoidSignals,
                profileContext,
                minScore,
                maxResults
            };

            localStorage.setItem('coachConnect_config', JSON.stringify(this.config));

            // Keep unencrypted API key in memory for use
            this.config.apiKey = apiKey;

            this.showToast('Settings saved securely!', 'success');
            this.closeConfig();
            this.updateUI();
        } catch (error) {
            console.error('Error saving config:', error);
            this.showToast('Failed to save settings', 'error');
        }
    }

    // Enhanced UI Management with Error Boundaries
    initializeEventListeners() {
        try {
            document.getElementById('findProspectsBtn').addEventListener('click', (e) => {
                e.preventDefault();
                this.findProspectsWithValidation();
            });

            document.getElementById('configBtn').addEventListener('click', (e) => {
                e.preventDefault();
                this.openConfig();
            });

            document.getElementById('exportBtn').addEventListener('click', (e) => {
                e.preventDefault();
                this.exportDataSafely();
            });

            document.getElementById('importQuoraBtn')?.addEventListener('click', (e) => {
                e.preventDefault();
                this.importQuoraLeadSafely();
            });

            document.getElementById('filterActiveBtn')?.addEventListener('click', () => this.setFilterSafely('active'));
            document.getElementById('filterSavedBtn')?.addEventListener('click', () => this.setFilterSafely('saved'));
            document.getElementById('filterRejectedBtn')?.addEventListener('click', () => this.setFilterSafely('rejected'));

            // Add abort button for analysis
            const abortBtn = document.createElement('button');
            abortBtn.id = 'abortBtn';
            abortBtn.className = 'bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors hidden';
            abortBtn.textContent = '⏹ Stop Analysis';
            abortBtn.addEventListener('click', () => this.abortAnalysis());

            const actionPanel = document.querySelector('.bg-white.rounded-lg.shadow-sm .flex.space-x-3');
            if (actionPanel) {
                actionPanel.appendChild(abortBtn);
            }

            // Add keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    switch (e.key) {
                        case 'k':
                            e.preventDefault();
                            this.openConfig();
                            break;
                        case 'f':
                            e.preventDefault();
                            this.findProspectsWithValidation();
                            break;
                        case 'e':
                            e.preventDefault();
                            this.exportDataSafely();
                            break;
                    }
                }
            });

        } catch (error) {
            console.error('Error setting up event listeners:', error);
        }
    }

    updateUI() {
        try {
            // Update configuration status
            const configStatus = document.getElementById('configStatus');
            if (!this.config.apiKey) {
                configStatus.classList.remove('hidden');
            } else {
                configStatus.classList.add('hidden');
            }

            // Update stats
            this.updateStats();
            this.updateFilterButtons();

            // Show/hide empty state
            const emptyState = document.getElementById('emptyState');
            const prospectsContainer = document.getElementById('prospectsContainer');

            const visible = this.getVisibleProspects();
            if (visible.length === 0) {
                emptyState.classList.remove('hidden');
                prospectsContainer.innerHTML = '';
            } else {
                emptyState.classList.add('hidden');
                this.renderProspectsSafely();
            }
        } catch (error) {
            console.error('Error updating UI:', error);
        }
    }

    updateStats() {
        try {
            const total = this.prospects.length;
            const highQuality = this.prospects.filter(p => p.score >= 8).length;
            const contacted = this.prospects.filter(p => p.contacted).length;
            const saved = this.prospects.filter(p => p.saved).length;
            const avgScore = total > 0
                ? (this.prospects.reduce((sum, p) => sum + p.score, 0) / total).toFixed(1)
                : 0;

            document.getElementById('totalCount').textContent = total;
            document.getElementById('highQualityCount').textContent = highQuality;
            document.getElementById('avgScore').textContent = avgScore;
            document.getElementById('savedCount').textContent = saved;
            document.getElementById('rejectedCount').textContent = this.rejectedLeads.length;

            // Add response rate if we have contacted prospects
            if (contacted > 0) {
                const responded = this.prospects.filter(p => p.responded).length;
                const responseRate = ((responded / contacted) * 100).toFixed(1);

                // Update response rate display (if element exists)
                const responseEl = document.getElementById('responseRate');
                if (responseEl) {
                    responseEl.textContent = `${responseRate}%`;
                }
            }
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    setFilterSafely(filter) {
        this.currentFilter = filter;
        this.updateUI();
    }

    updateFilterButtons() {
        const buttons = {
            active: document.getElementById('filterActiveBtn'),
            saved: document.getElementById('filterSavedBtn'),
            rejected: document.getElementById('filterRejectedBtn')
        };
        Object.entries(buttons).forEach(([filter, button]) => {
            if (!button) return;
            const active = this.currentFilter === filter;
            button.className = active
                ? 'bg-brand-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors'
                : 'px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors';
        });
    }

    getVisibleProspects() {
        if (this.currentFilter === 'saved') {
            return this.prospects.filter(p => p.saved);
        }
        if (this.currentFilter === 'rejected') {
            return this.rejectedLeads.map(item => ({
                ...item.prospect,
                post: item.post,
                analysis: item.prospect?.analysis || {
                    reasoning: item.reason,
                    financial: 'Rejected',
                    struggle: item.reason,
                    motivation: 1,
                    conversion: 'Rejected'
                },
                score: item.prospect?.score || 0,
                message: item.prospect?.message || '',
                rejected: true,
                badLeadReason: item.reason,
                badLeadCategory: item.category
            }));
        }
        return this.prospects.filter(p => !p.rejected);
    }

    passesKeywordFilters(post) {
        const haystack = `${post.title || ''} ${post.selftext || ''} ${post.content || ''}`.toLowerCase();
        const includeKeywords = this.config.includeKeywords || [];
        const avoidKeywords = this.config.avoidKeywords || [];

        if (includeKeywords.length > 0 && !includeKeywords.some(keyword => haystack.includes(keyword))) {
            return false;
        }

        if (avoidKeywords.some(keyword => haystack.includes(keyword))) {
            return false;
        }

        return true;
    }

    shouldAnalyzePost(post) {
        const author = String(post.author || '').toLowerCase();
        if (this.disqualifiedPostIds.has(post.id) || this.rejectedPostIds.has(post.id)) {
            return false;
        }
        if (author && this.rejectedAuthors.has(author)) {
            return false;
        }
        return this.passesKeywordFilters(post);
    }

    // SECURE Main prospect finding functionality
    async findProspectsWithValidation() {
        if (!this.config.apiKey) {
            this.showToast('Please configure your API key first', 'warning');
            this.openConfig();
            return;
        }

        if (this.isAnalyzing) {
            this.showToast('Analysis already in progress. Click "Stop Analysis" to abort.', 'info');
            return;
        }

        // Check rate limits
        try {
            this.redditRateLimit();
            this.aiRateLimit();
        } catch (error) {
            this.showToast(error.message, 'warning');
            return;
        }

        await this.findProspects();
    }

    async findProspects() {
        this.isAnalyzing = true;
        this.analysisAborted = false;

        try {
            this.showLoadingState();
            this.showAbortButton();

            const allPosts = [];

            // Fetch posts from all subreddits with error handling
            for (let i = 0; i < this.config.subreddits.length && !this.analysisAborted; i++) {
                const subreddit = this.config.subreddits[i];
                this.updateProgress((i / this.config.subreddits.length) * 30, `Fetching r/${subreddit}...`);

                try {
                    // Fetch from multiple sources for better data diversity
                    const [newPosts, hotPosts] = await Promise.allSettled([
                        this.fetchRedditPostsSafely(subreddit, 25, 'new'),
                        this.fetchRedditPostsSafely(subreddit, 25, 'hot')
                    ]);

                    let totalPosts = 0;
                    if (newPosts.status === 'fulfilled') {
                        const visiblePosts = newPosts.value.filter(post => this.shouldAnalyzePost(post));
                        allPosts.push(...visiblePosts);
                        totalPosts += visiblePosts.length;
                    }
                    if (hotPosts.status === 'fulfilled') {
                        const visiblePosts = hotPosts.value.filter(post => this.shouldAnalyzePost(post));
                        allPosts.push(...visiblePosts);
                        totalPosts += visiblePosts.length;
                    }

                    console.log(`Found ${totalPosts} posts from r/${subreddit} (new + hot)`);

                    if (totalPosts === 0) {
                        console.warn(`No posts found in r/${subreddit} - might be private, empty, or invalid`);
                    }
                } catch (error) {
                    console.warn(`Failed to fetch r/${subreddit}:`, error.message);
                    this.updateProgress((i / this.config.subreddits.length) * 30, `Failed to fetch r/${subreddit}, continuing...`);
                }

                // Rate limiting
                if (i < this.config.subreddits.length - 1 && !this.analysisAborted) {
                    await this.delay(1500);
                }
            }

            if (this.analysisAborted) {
                this.showToast('Analysis stopped by user', 'info');
                return;
            }

            if (allPosts.length === 0) {
                throw new Error(`No posts found. Checked ${this.config.subreddits.length} subreddits. Check if subreddit names are correct and have recent posts.`);
            }

            // Remove duplicates based on post ID
            const uniquePosts = allPosts.filter((post, index, arr) =>
                arr.findIndex(p => p.id === post.id) === index
            );

            console.log(`Found ${uniquePosts.length} unique posts from ${this.config.subreddits.length} subreddits (${allPosts.length} total before dedup)`);

            // AI analysis with enhanced error handling
            const prospects = [];
            const maxPosts = Math.min(uniquePosts.length, this.config.maxResults * 3); // Analyze more to get quality results

            for (let i = 0; i < maxPosts && !this.analysisAborted; i++) {
                const post = uniquePosts[i];
                this.updateProgress(30 + ((i / maxPosts) * 70), `Analyzing post ${i + 1}/${maxPosts}...`);

                try {
                    const profileContext = await this.fetchAuthorContextSafely(post.author);
                    const analysis = await this.analyzePostSafely(post, profileContext);

                    if (!analysis.disqualified && analysis.score >= this.config.minScore) {
                        const message = await this.generateMessageSafely(post, analysis);

                        prospects.push({
                            id: `${post.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            post: SecurityUtils.sanitizePost(post),
                            analysis,
                            message: SecurityUtils.escapeHTML(message),
                            score: analysis.score,
                            saved: false,
                            notes: '',
                            profileContext,
                            contacted: false,
                            createdAt: new Date().toISOString()
                        });

                        if (prospects.length >= this.config.maxResults) {
                            break;
                        }
                    }

                    // Rate limiting for AI calls
                    if (!this.analysisAborted) {
                        await this.delay(1200);
                    }
                } catch (error) {
                    console.warn(`Failed to analyze post ${post.id}:`, error);
                    continue;
                }
            }

            if (this.analysisAborted) {
                this.showToast('Analysis stopped by user', 'info');
                return;
            }

            // Sort by score (highest first)
            prospects.sort((a, b) => b.score - a.score);

            this.prospects = prospects;
            this.saveProspectsSafely();

            this.hideLoadingState();
            this.hideAbortButton();
            this.updateUI();

            if (prospects.length === 0) {
                this.showToast('No high-quality prospects found. Try lowering your score threshold or expanding subreddit list.', 'info');
            } else {
                this.showToast(`Found ${prospects.length} high-quality prospects!`, 'success');
            }

        } catch (error) {
            this.hideLoadingState();
            this.hideAbortButton();
            this.showError(`Analysis failed: ${error.message}`);
            console.error('Error finding prospects:', error);
        } finally {
            this.isAnalyzing = false;
            this.analysisAborted = false;
        }
    }

    abortAnalysis() {
        this.analysisAborted = true;
        this.isAnalyzing = false;
        this.hideLoadingState();
        this.hideAbortButton();
        this.showToast('Analysis aborted', 'info');
    }

    showAbortButton() {
        const abortBtn = document.getElementById('abortBtn');
        if (abortBtn) {
            abortBtn.classList.remove('hidden');
        }
    }

    hideAbortButton() {
        const abortBtn = document.getElementById('abortBtn');
        if (abortBtn) {
            abortBtn.classList.add('hidden');
        }
    }

    // SECURE Reddit API integration with enhanced validation
    async fetchRedditPostsSafely(subreddit, limit = 50, sort = 'new') {
        try {
            // Validate subreddit name
            if (!/^[a-zA-Z0-9_]+$/.test(subreddit)) {
                throw new Error(`Invalid subreddit name: ${subreddit}`);
            }

            // Use old.reddit.com for better reliability and less blocking
            const url = `https://old.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`;

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://old.reddit.com/',
                'Origin': 'https://old.reddit.com'
            };

            const response = await fetch(url, {
                headers,
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });

            if (!response.ok) {
                throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data?.data?.children) {
                return [];
            }

            return data.data.children
                .map(child => SecurityUtils.sanitizePost({
                    id: child.data.id,
                    author: child.data.author,
                    title: child.data.title || '',
                    selftext: child.data.selftext || '',
                    subreddit: child.data.subreddit,
                    created_utc: child.data.created_utc,
                    score: child.data.score || 0,
                    num_comments: child.data.num_comments || 0,
                    url: `https://reddit.com${child.data.permalink}`,
                    content: `${child.data.title || ''} ${child.data.selftext || ''}`.trim()
                }))
                .filter(post => this.isValidPostStrict(post));

        } catch (error) {
            console.error(`Error fetching r/${subreddit}:`, error);
            throw error;
        }
    }

    isValidPostStrict(post) {
        try {
            // Enhanced validation
            if (!post.author || post.author === '[deleted]' || post.author === 'AutoModerator') {
                return false;
            }

            if (!post.content || post.content.length < 20 || post.content.length > 5000) {
                return false;
            }

            // Enhanced spam detection
            const spamKeywords = [
                'onlyfans', 'sugar daddy', 'escort', 'cam girl', 'selling', 'buy now',
                'click here', 'follow me', 'dm me for', 'snapchat', 'instagram',
                'telegram', 'whatsapp', 'kik', 'discord', 'reddit.com/user',
                'cashapp', 'venmo', 'paypal', '$$$', 'money back guarantee'
            ];

            const contentLower = post.content.toLowerCase();
            if (spamKeywords.some(keyword => contentLower.includes(keyword))) {
                return false;
            }

            // Check for minimum quality indicators
            const helpKeywords = ['help', 'advice', 'struggling', 'need', 'how do', 'what should'];
            const hasHelpIndicator = helpKeywords.some(keyword => contentLower.includes(keyword));

            return hasHelpIndicator;

        } catch (error) {
            console.warn('Error validating post:', error);
            return false;
        }
    }

    async fetchAuthorContextSafely(author) {
        if (!this.config.profileContext) {
            return '';
        }

        if (!/^[A-Za-z0-9_-]+$/.test(author || '')) {
            return '';
        }

        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://old.reddit.com/'
            };

            const [submittedResponse, commentsResponse] = await Promise.allSettled([
                fetch(`https://old.reddit.com/user/${author}/submitted.json?limit=5&raw_json=1`, {
                    headers,
                    signal: AbortSignal.timeout(8000)
                }),
                fetch(`https://old.reddit.com/user/${author}/comments.json?limit=5&raw_json=1`, {
                    headers,
                    signal: AbortSignal.timeout(8000)
                })
            ]);

            const snippets = [];
            if (submittedResponse.status === 'fulfilled' && submittedResponse.value.ok) {
                const submitted = await submittedResponse.value.json();
                (submitted?.data?.children || []).slice(0, 5).forEach(child => {
                    const data = child.data || {};
                    const text = `${data.title || ''} ${data.selftext || ''}`.trim();
                    if (text) snippets.push(`Post: ${text.substring(0, 180)}`);
                });
            }

            if (commentsResponse.status === 'fulfilled' && commentsResponse.value.ok) {
                const comments = await commentsResponse.value.json();
                (comments?.data?.children || []).slice(0, 5).forEach(child => {
                    const data = child.data || {};
                    if (data.body) snippets.push(`Comment: ${data.body.substring(0, 180)}`);
                });
            }

            return SecurityUtils.escapeHTML(snippets.join('\n').substring(0, 1200));
        } catch (error) {
            console.warn(`Could not fetch profile context for u/${author}:`, error);
            return '';
        }
    }

    async analyzePostSafely(post, profileContext = '') {
        const postDate = new Date(post.created_utc * 1000).toLocaleDateString();
        const contextBlock = profileContext
            ? `\nRecent profile context. Use this only to infer fit/disqualifiers, not to shame the user:\n${profileContext.substring(0, 1200)}\n`
            : '';
        const prompt = `Rate dating coaching lead fit for a coach who only wants straight male dating clients.

Reward these desired signals:
${this.config.desiredSignals}

Disqualify these cases even if there is emotional pain:
${this.config.avoidSignals}

Important: infer meaning, not just keywords. If "college" is only part of an old story, do not disqualify for student status. If the author says they are currently in college, disqualify.

u/${post.author} r/${post.subreddit} ${postDate}
"${post.content.substring(0, 400)}"
${contextBlock}

Format:
SCORE: X.X
PAIN: 0-10
MONEY: 0-10 or UNKNOWN
LOCATION: US/EUROPE/OTHER/UNKNOWN
AGE: number or UNKNOWN
GENDER: MALE/FEMALE/UNKNOWN
DISQUALIFY: YES or NO
REASON: [brief why]`;

        try {
            const response = await this.callAISafely(prompt);
            return this.parsePostAnalysisSafely(response);
        } catch (error) {
            return {
                score: 3.0,
                pain: 0,
                money: 'UNKNOWN',
                location: 'UNKNOWN',
                age: '',
                gender: 'UNKNOWN',
                disqualified: true,
                financial: 'Unknown',
                struggle: 'AI error',
                motivation: 1,
                conversion: 'Low',
                reasoning: 'AI error'
            };
        }
    }

    async generateMessageSafely(post, analysis) {
        const prompt = `Write helpful 2-sentence outreach for:
"${post.content.substring(0, 200)}"
Be empathetic, no sales pitch.`;

        try {
            const message = await this.callAISafely(prompt);
            return this.sanitizeMessage(message);
        } catch (error) {
            return "Hi! I noticed your post and can relate to your situation. Would you be interested in some advice?";
        }
    }

    sanitizeMessage(message) {
        // Remove quotes and clean up
        message = message.replace(/^["']|["']$/g, '').trim();

        // Ensure it's not too long
        if (message.length > 300) {
            message = message.substring(0, 300) + '...';
        }

        return SecurityUtils.escapeHTML(message);
    }

    async callAISafely(prompt, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch('https://api.deepinfra.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 180,
                        temperature: 0.1
                    }),
                    signal: AbortSignal.timeout(30000) // 30 second timeout
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`AI API error: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                return data.choices[0].message.content.trim();

            } catch (error) {
                console.warn(`AI call attempt ${attempt} failed:`, error);

                if (attempt === maxRetries) {
                    throw error;
                }

                // Wait before retry
                await this.delay(1000 * attempt);
            }
        }
    }

    parsePostAnalysisSafely(response) {
        try {
            const scoreMatch = response.match(/SCORE:\s*(\d+\.?\d*)/i);
            const painMatch = response.match(/PAIN:\s*(\d+\.?\d*)/i);
            const moneyMatch = response.match(/MONEY:\s*([^\n]+)/i);
            const locationMatch = response.match(/LOCATION:\s*([^\n]+)/i);
            const ageMatch = response.match(/AGE:\s*([^\n]+)/i);
            const genderMatch = response.match(/GENDER:\s*([^\n]+)/i);
            const disqualifyMatch = response.match(/DISQUALIFY:\s*(YES|NO)/i);
            const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i);
            const score = scoreMatch ? Math.max(1, Math.min(10, parseFloat(scoreMatch[1]))) : 5.0;
            const pain = painMatch ? Math.max(0, Math.min(10, parseFloat(painMatch[1]))) : 0;
            const money = moneyMatch ? SecurityUtils.escapeHTML(moneyMatch[1].trim().toUpperCase()) : 'UNKNOWN';
            const location = locationMatch ? SecurityUtils.escapeHTML(locationMatch[1].trim().toUpperCase()) : 'UNKNOWN';
            const ageRaw = ageMatch ? ageMatch[1].trim() : '';
            const age = /^unknown$/i.test(ageRaw) ? '' : SecurityUtils.escapeHTML(ageRaw);
            const gender = genderMatch ? SecurityUtils.escapeHTML(genderMatch[1].trim().toUpperCase()) : 'UNKNOWN';
            const disqualified = (disqualifyMatch ? /^yes$/i.test(disqualifyMatch[1]) : false) || gender === 'FEMALE';

            return {
                score,
                pain,
                money,
                location,
                age,
                gender,
                disqualified,
                financial: `Money: ${money}`,
                struggle: `Pain: ${pain}/10`,
                motivation: Math.max(1, Math.min(5, Math.round(pain / 2))),
                conversion: disqualified ? 'Disqualified' : score >= 8 ? 'High' : score >= 6 ? 'Medium' : 'Low',
                reasoning: reasonMatch ? SecurityUtils.escapeHTML(reasonMatch[1].trim()) : 'No reason provided'
            };
        } catch (error) {
            return {
                score: 5.0,
                pain: 0,
                money: 'UNKNOWN',
                location: 'UNKNOWN',
                age: '',
                gender: 'UNKNOWN',
                disqualified: false,
                financial: 'Money: UNKNOWN',
                struggle: 'Pain: 0/10',
                motivation: 1,
                conversion: 'Low',
                reasoning: 'Parse error'
            };
        }
    }

    // SECURE UI Rendering - NO MORE XSS VULNERABILITIES!
    renderProspectsSafely() {
        try {
            const container = document.getElementById('prospectsContainer');

            // Clear container safely
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            this.getVisibleProspects().forEach((prospect, index) => {
                try {
                    const prospectCard = this.createProspectCardSafely(prospect, index);
                    container.appendChild(prospectCard);
                } catch (error) {
                    console.error(`Error rendering prospect ${prospect.id}:`, error);
                }
            });
        } catch (error) {
            console.error('Error rendering prospects:', error);
            this.showError('Failed to display prospects');
        }
    }

    createProspectCardSafely(prospect, index) {
        try {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-sm p-6 border border-gray-200 card-hover';

            // Create elements safely
            const header = this.createHeaderSafely(prospect);
            const content = this.createContentSafely(prospect);
            const tags = this.createTagsSafely(prospect);
            const analysis = this.createAnalysisSafely(prospect);
            const message = this.createMessageSectionSafely(prospect);

            // Append elements
            card.appendChild(header);
            card.appendChild(content);
            card.appendChild(tags);
            card.appendChild(analysis);
            card.appendChild(message);

            return card;

        } catch (error) {
            console.error('Error creating prospect card:', error);

            // Return safe fallback card
            const errorCard = document.createElement('div');
            errorCard.className = 'bg-red-50 rounded-lg p-6 border border-red-200';
            errorCard.textContent = 'Error displaying prospect - data may be corrupted';
            return errorCard;
        }
    }

    createHeaderSafely(prospect) {
        const header = document.createElement('div');
        header.className = 'flex justify-between items-start mb-4';

        const leftSection = document.createElement('div');
        leftSection.className = 'flex-1';

        const topRow = document.createElement('div');
        topRow.className = 'flex items-center space-x-3 mb-2';

        // Username (safe text content)
        const username = SecurityUtils.createElement('h3', `u/${prospect.post.author}`, {
            className: 'text-lg font-semibold text-gray-900'
        });

        // Score badge
        const scoreClass = prospect.score >= 8.5 ? 'text-green-700 bg-green-100' :
                          prospect.score >= 7.0 ? 'text-yellow-700 bg-yellow-100' :
                          'text-red-700 bg-red-100';

        const scoreBadge = SecurityUtils.createElement('span', `${prospect.score}/10`, {
            className: `px-3 py-1 rounded-full text-sm font-medium ${scoreClass}`
        });

        // Subreddit badge
        const subredditBadge = SecurityUtils.createElement('span', `r/${prospect.post.subreddit}`, {
            className: 'text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded'
        });

        const dateBadge = SecurityUtils.createElement('span', `Posted ${this.formatPostDate(prospect.post.created_utc)}`, {
            className: 'text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded'
        });

        // View Post link
        const postLink = document.createElement('a');
        postLink.href = prospect.post.url;
        postLink.target = '_blank';
        postLink.rel = 'noopener noreferrer';
        postLink.textContent = '🔗 View Post';
        postLink.className = 'text-sm text-blue-600 hover:text-blue-800 underline';

        topRow.appendChild(username);
        topRow.appendChild(scoreBadge);
        topRow.appendChild(subredditBadge);
        topRow.appendChild(dateBadge);
        topRow.appendChild(postLink);

        // Title
        const title = SecurityUtils.createElement('h4', `"${prospect.post.title}"`, {
            className: 'font-medium text-gray-800 mb-2'
        });

        leftSection.appendChild(topRow);
        leftSection.appendChild(title);
        header.appendChild(leftSection);

        return header;
    }

    createContentSafely(prospect) {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'bg-gray-50 rounded-lg p-4 mb-4 border border-gray-100';

        const sourceText = prospect.post.selftext || prospect.post.content || prospect.post.title || '';
        const text = sourceText.substring(0, 200);
        const displayText = text + (sourceText.length > 200 ? '...' : '');

        const contentP = SecurityUtils.createElement('p', displayText, {
            className: 'text-gray-700 italic leading-relaxed'
        });

        contentDiv.appendChild(contentP);
        return contentDiv;
    }

    createTagsSafely(prospect) {
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'flex flex-wrap gap-2 mb-4';

        const tags = [
            { icon: '💰', text: prospect.analysis.financial || 'Money: UNKNOWN', class: 'bg-blue-100 text-blue-800' },
            { icon: '😔', text: prospect.analysis.struggle || 'Pain: UNKNOWN', class: 'bg-orange-100 text-orange-800' },
            { icon: '🌍', text: `Location: ${prospect.analysis.location || 'UNKNOWN'}`, class: 'bg-cyan-100 text-cyan-800' },
            { icon: '🚻', text: `Gender: ${prospect.analysis.gender || 'UNKNOWN'}`, class: 'bg-pink-100 text-pink-800' },
            { icon: '🎯', text: `Motivation: ${prospect.analysis.motivation || 'UNKNOWN'}/5`, class: 'bg-green-100 text-green-800' },
            ...(prospect.analysis.age ? [{ icon: '👤', text: `Age: ${prospect.analysis.age}`, class: 'bg-gray-100 text-gray-800' }] : []),
            { icon: '📈', text: `${prospect.analysis.conversion || 'Unknown'} Conversion`, class: 'bg-purple-100 text-purple-800' },
            ...(prospect.status ? [{ icon: '📌', text: `CRM: ${prospect.status}`, class: 'bg-slate-100 text-slate-800' }] : []),
            ...(prospect.notes ? [{ icon: '📝', text: `Notes: ${prospect.notes.substring(0, 40)}`, class: 'bg-amber-100 text-amber-800' }] : [])
        ];

        tags.forEach(tag => {
            const tagSpan = SecurityUtils.createElement('span', `${tag.icon} ${tag.text}`, {
                className: `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${tag.class}`
            });
            tagsDiv.appendChild(tagSpan);
        });

        return tagsDiv;
    }

    createAnalysisSafely(prospect) {
        const analysisDiv = document.createElement('div');
        analysisDiv.className = 'mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100';

        const analysisP = SecurityUtils.createElement('p', '', {
            className: 'text-sm text-blue-800'
        });

        const strong = SecurityUtils.createElement('strong', 'AI Analysis: ');
        const reasoningText = document.createTextNode(prospect.analysis.reasoning);

        analysisP.appendChild(strong);
        analysisP.appendChild(reasoningText);
        analysisDiv.appendChild(analysisP);

        if (prospect.badLeadReason) {
            const rejectedP = SecurityUtils.createElement('p', `Bad Lead Reason: ${prospect.badLeadReason}`, {
                className: 'text-sm text-red-800 mt-2'
            });
            analysisDiv.appendChild(rejectedP);
        }

        return analysisDiv;
    }

    createMessageSectionSafely(prospect) {
        const messageSection = document.createElement('div');
        messageSection.className = 'border-t pt-4';

        if (prospect.rejected) {
            const title = SecurityUtils.createElement('h4', 'Rejected Lead', {
                className: 'font-medium text-gray-900 mb-3'
            });
            const reason = SecurityUtils.createElement('p', `Reason: ${prospect.badLeadReason || 'Not a fit'}`, {
                className: 'text-sm text-red-800 bg-red-50 border border-red-100 rounded-lg p-3'
            });
            messageSection.appendChild(title);
            messageSection.appendChild(reason);
            return messageSection;
        }

        // Title
        const title = SecurityUtils.createElement('h4', 'AI-Generated Message', {
            className: 'font-medium text-gray-900 mb-3'
        });

        // Message content
        const messageDiv = document.createElement('div');
        messageDiv.className = 'bg-indigo-50 rounded-lg p-4 mb-3 border border-indigo-100';

        const messageP = SecurityUtils.createElement('p', prospect.message, {
            className: 'text-gray-800 leading-relaxed'
        });

        messageDiv.appendChild(messageP);

        // Action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'flex flex-wrap gap-3';

        // Copy button
        const copyBtn = SecurityUtils.createElement('button', '📋 Copy Message', {
            className: 'bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors'
        });
        copyBtn.addEventListener('click', () => this.copyMessageSafely(prospect.id));

        actionsDiv.appendChild(copyBtn);

        const saveBtn = SecurityUtils.createElement('button', prospect.saved ? '★ Unsave' : '☆ Save Lead', {
            className: prospect.saved
                ? 'bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors'
                : 'bg-white text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors border border-gray-300'
        });
        saveBtn.addEventListener('click', () => this.toggleSavedSafely(prospect.id));
        actionsDiv.appendChild(saveBtn);

        const editBtn = SecurityUtils.createElement('button', '✏️ Edit Lead', {
            className: 'bg-slate-600 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors'
        });
        editBtn.addEventListener('click', () => this.editLeadSafely(prospect.id));
        actionsDiv.appendChild(editBtn);

        // Contact status button
        if (!prospect.contacted) {
            const contactBtn = SecurityUtils.createElement('button', '✓ Mark as Contacted', {
                className: 'bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors'
            });
            contactBtn.addEventListener('click', () => this.markAsContactedSafely(prospect.id));
            actionsDiv.appendChild(contactBtn);
        } else {
            const contactedSpan = SecurityUtils.createElement('span', '✓ Contacted', {
                className: 'inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-800 border border-green-200'
            });
            actionsDiv.appendChild(contactedSpan);
        }

        const badLeadBtn = SecurityUtils.createElement('button', '🚫 Not a Lead', {
            className: 'bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors'
        });
        badLeadBtn.addEventListener('click', () => this.markAsBadLeadSafely(prospect.id));
        actionsDiv.appendChild(badLeadBtn);

        messageSection.appendChild(title);
        messageSection.appendChild(messageDiv);
        messageSection.appendChild(actionsDiv);

        return messageSection;
    }

    // SECURE Actions with validation
    copyMessageSafely(prospectId) {
        try {
            const prospect = this.prospects.find(p => p.id === prospectId);
            if (!prospect) {
                this.showToast('Prospect not found', 'error');
                return;
            }

            navigator.clipboard.writeText(prospect.message).then(() => {
                this.showToast('Message copied to clipboard!', 'success', 2000);
            }).catch(() => {
                // Fallback for older browsers
                this.fallbackCopyTextToClipboard(prospect.message);
            });
        } catch (error) {
            console.error('Error copying message:', error);
            this.showToast('Failed to copy message', 'error');
        }
    }

    fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            this.showToast('Message copied to clipboard!', 'success', 2000);
        } catch (err) {
            this.showToast('Unable to copy message', 'error');
        }

        document.body.removeChild(textArea);
    }

    markAsContactedSafely(prospectId) {
        try {
            const prospect = this.prospects.find(p => p.id === prospectId);
            if (!prospect) {
                this.showToast('Prospect not found', 'error');
                return;
            }

            prospect.contacted = true;
            prospect.contactedAt = new Date().toISOString();
            prospect.status = 'Contacted';

            this.saveProspectsSafely();
            this.showToast('Marked as contacted!', 'success', 2000);
            this.updateUI();

        } catch (error) {
            console.error('Error marking as contacted:', error);
            this.showToast('Failed to update contact status', 'error');
        }
    }

    markAsBadLeadSafely(prospectId) {
        try {
            const prospect = this.prospects.find(p => p.id === prospectId);
            if (!prospect) {
                this.showToast('Prospect not found', 'error');
                return;
            }

            const reasonInput = window.prompt('Why is this not a lead?', 'Not a fit');
            const reason = SecurityUtils.escapeHTML((reasonInput || 'Not a fit').substring(0, 200));
            const categoryInput = window.prompt('Bad lead category?', 'Manual rejection');
            const category = SecurityUtils.escapeHTML((categoryInput || 'Manual rejection').substring(0, 80));

            this.disqualifiedPostIds.add(prospect.post.id);
            this.rejectedPostIds.add(prospect.post.id);
            if (prospect.post.author) {
                this.rejectedAuthors.add(prospect.post.author.toLowerCase());
            }
            this.rejectedLeads.unshift({
                post: prospect.post,
                prospect: {
                    ...prospect,
                    status: 'Rejected',
                    badLeadReason: reason,
                    badLeadCategory: category,
                    rejected: true
                },
                reason,
                category,
                rejectedAt: new Date().toISOString()
            });
            localStorage.setItem('coachConnect_disqualifiedPostIds', JSON.stringify([...this.disqualifiedPostIds]));
            this.saveRejectedLeadsSafely();
            this.prospects = this.prospects.filter(p => p.id !== prospectId);

            this.saveProspectsSafely();
            this.showToast('Lead rejected and hidden from future searches', 'success', 2000);
            this.updateUI();

        } catch (error) {
            console.error('Error disqualifying lead:', error);
            this.showToast('Failed to hide lead', 'error');
        }
    }

    toggleSavedSafely(prospectId) {
        try {
            const prospect = this.prospects.find(p => p.id === prospectId);
            if (!prospect) {
                this.showToast('Prospect not found', 'error');
                return;
            }

            prospect.saved = !prospect.saved;
            prospect.status = prospect.saved ? 'Saved' : (prospect.contacted ? 'Contacted' : 'New');
            this.saveProspectsSafely();
            this.showToast(prospect.saved ? 'Lead saved' : 'Lead removed from saved list', 'success', 2000);
            this.updateUI();
        } catch (error) {
            console.error('Error saving lead:', error);
            this.showToast('Failed to save lead', 'error');
        }
    }

    editLeadSafely(prospectId) {
        try {
            const prospect = this.prospects.find(p => p.id === prospectId);
            if (!prospect) {
                this.showToast('Prospect not found', 'error');
                return;
            }

            const updates = {
                pain: window.prompt('Pain point 0-10', prospect.analysis.pain ?? ''),
                money: window.prompt('Money/resourcefulness 0-10 or UNKNOWN', prospect.analysis.money || 'UNKNOWN'),
                location: window.prompt('Location: US / EUROPE / OTHER / UNKNOWN', prospect.analysis.location || 'UNKNOWN'),
                age: window.prompt('Age or UNKNOWN', prospect.analysis.age || 'UNKNOWN'),
                gender: window.prompt('Gender: MALE / FEMALE / UNKNOWN', prospect.analysis.gender || 'UNKNOWN'),
                status: window.prompt('CRM Status', prospect.status || 'New'),
                notes: window.prompt('Notes', prospect.notes || '')
            };

            this.saveLeadEditsSafely(prospectId, updates);
        } catch (error) {
            console.error('Error editing lead:', error);
            this.showToast('Failed to edit lead', 'error');
        }
    }

    saveLeadEditsSafely(prospectId, updates) {
        try {
            const prospect = this.prospects.find(p => p.id === prospectId);
            if (!prospect) {
                this.showToast('Prospect not found', 'error');
                return;
            }

            const pain = Math.max(0, Math.min(10, parseFloat(updates.pain)));
            if (Number.isFinite(pain)) {
                prospect.analysis.pain = pain;
                prospect.analysis.struggle = `Pain: ${pain}/10`;
                prospect.analysis.motivation = Math.max(1, Math.min(5, Math.round(pain / 2)));
            }

            const money = SecurityUtils.escapeHTML(String(updates.money || prospect.analysis.money || 'UNKNOWN').toUpperCase().substring(0, 40));
            const location = SecurityUtils.escapeHTML(String(updates.location || prospect.analysis.location || 'UNKNOWN').toUpperCase().substring(0, 40));
            const gender = SecurityUtils.escapeHTML(String(updates.gender || prospect.analysis.gender || 'UNKNOWN').toUpperCase().substring(0, 40));
            const age = SecurityUtils.escapeHTML(String(updates.age || '').replace(/^UNKNOWN$/i, '').substring(0, 20));

            prospect.analysis.money = money;
            prospect.analysis.financial = `Money: ${money}`;
            prospect.analysis.location = location;
            prospect.analysis.gender = gender;
            prospect.analysis.age = age;
            prospect.status = SecurityUtils.escapeHTML(String(updates.status || prospect.status || 'New').substring(0, 60));
            prospect.notes = SecurityUtils.escapeHTML(String(updates.notes || '').substring(0, 500));

            this.saveProspectsSafely();
            this.showToast('Lead updated', 'success', 2000);
            this.updateUI();
        } catch (error) {
            console.error('Error saving lead edits:', error);
            this.showToast('Failed to save lead edits', 'error');
        }
    }

    async importQuoraLeadSafely() {
        if (!this.config.apiKey) {
            this.showToast('Please configure your API key first', 'warning');
            this.openConfig();
            return;
        }

        const input = document.getElementById('quoraImportInput');
        const text = (input?.value || '').trim();
        if (text.length < 20) {
            this.showToast('Paste at least 20 characters to import a lead', 'warning');
            return;
        }

        try {
            this.showLoadingState();
            this.updateProgress(20, 'Scoring manual Quora lead...');

            const post = SecurityUtils.sanitizePost({
                id: `quora-manual-${Date.now()}`,
                author: 'quora-manual',
                title: text.substring(0, 80) || 'Manual Quora lead',
                selftext: text,
                subreddit: 'quora-manual',
                created_utc: Math.floor(Date.now() / 1000),
                score: 0,
                num_comments: 0,
                url: 'https://www.quora.com/',
                content: text
            });

            const analysis = await this.analyzePostSafely(post, '');
            const message = await this.generateMessageSafely(post, analysis);
            const prospect = {
                id: `${post.id}_${Math.random().toString(36).substr(2, 9)}`,
                post,
                analysis,
                message: SecurityUtils.escapeHTML(message),
                score: analysis.score,
                saved: true,
                notes: 'Manual Quora import',
                status: 'Saved',
                profileContext: '',
                contacted: false,
                createdAt: new Date().toISOString()
            };

            this.prospects.unshift(prospect);
            this.saveProspectsSafely();
            if (input) input.value = '';
            this.hideLoadingState();
            this.currentFilter = 'saved';
            this.updateUI();
            this.showToast('Manual lead imported and scored', 'success');
        } catch (error) {
            this.hideLoadingState();
            console.error('Error importing manual Quora lead:', error);
            this.showToast('Manual import failed', 'error');
        }
    }

    saveProspectsSafely() {
        try {
            const dataToSave = JSON.stringify(this.prospects);
            localStorage.setItem('coachConnect_prospects', dataToSave);
        } catch (error) {
            console.error('Error saving prospects:', error);
            this.showToast('Failed to save data', 'warning');
        }
    }

    saveRejectedLeadsSafely() {
        try {
            localStorage.setItem('coachConnect_rejectedLeads', JSON.stringify(this.rejectedLeads));
        } catch (error) {
            console.error('Error saving rejected leads:', error);
            this.showToast('Failed to save rejected lead data', 'warning');
        }
    }

    // SECURE Export functionality with CSV injection protection
    exportDataSafely() {
        try {
            const exportRows = [...this.prospects, ...this.getRejectedProspectsForExport()];
            if (exportRows.length === 0) {
                this.showToast('No leads to export', 'warning');
                return;
            }

            const csvContent = this.generateSecureCSV();
            const filename = `prospects_${new Date().toISOString().split('T')[0]}.csv`;

            this.downloadFileSafely(csvContent, filename, 'text/csv');
            this.showToast(`Exported ${exportRows.length} leads securely`, 'success');

        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Export failed', 'error');
        }
    }

    generateSecureCSV() {
        const headers = [
            'Username', 'Subreddit', 'Post Date', 'Post Title', 'AI Score', 'Pain',
            'Money', 'Location', 'Age', 'Gender', 'Conversion', 'CRM Status', 'Bad Lead Reason',
            'Notes', 'Contacted', 'Contacted Date', 'Message Preview'
        ];

        const rows = [...this.prospects, ...this.getRejectedProspectsForExport()].map(p => [
            SecurityUtils.sanitizeCSV(p.post.author),
            SecurityUtils.sanitizeCSV(p.post.subreddit),
            this.formatPostDate(p.post.created_utc),
            SecurityUtils.sanitizeCSV(p.post.title),
            p.score.toString(),
            p.analysis.pain?.toString() || '',
            SecurityUtils.sanitizeCSV(p.analysis.money || 'UNKNOWN'),
            SecurityUtils.sanitizeCSV(p.analysis.location || 'UNKNOWN'),
            p.analysis.age ? p.analysis.age.toString() : '',
            SecurityUtils.sanitizeCSV(p.analysis.gender || 'UNKNOWN'),
            SecurityUtils.sanitizeCSV(p.analysis.conversion),
            SecurityUtils.sanitizeCSV(p.status || (p.rejected ? 'Rejected' : 'New')),
            SecurityUtils.sanitizeCSV(p.badLeadReason || ''),
            SecurityUtils.sanitizeCSV(p.notes || ''),
            p.contacted ? 'Yes' : 'No',
            p.contactedAt ? new Date(p.contactedAt).toLocaleDateString() : '',
            SecurityUtils.sanitizeCSV(p.message.substring(0, 100))
        ]);

        return [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
    }

    getRejectedProspectsForExport() {
        return this.rejectedLeads.map(item => ({
            ...(item.prospect || {}),
            post: item.post,
            analysis: item.prospect?.analysis || {
                pain: 0,
                money: 'UNKNOWN',
                location: 'UNKNOWN',
                age: '',
                gender: 'UNKNOWN',
                conversion: 'Rejected'
            },
            score: item.prospect?.score || 0,
            status: 'Rejected',
            badLeadReason: item.reason,
            notes: item.prospect?.notes || '',
            message: item.prospect?.message || '',
            rejected: true
        }));
    }

    formatPostDate(createdUtc) {
        const timestamp = Number(createdUtc) * 1000;
        if (!Number.isFinite(timestamp) || timestamp <= 0) {
            return 'unknown date';
        }
        return new Date(timestamp).toLocaleDateString();
    }

    downloadFileSafely(content, filename, mimeType) {
        try {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = SecurityUtils.escapeHTML(filename);
            link.style.display = 'none';

            document.body.appendChild(link);
            link.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);

        } catch (error) {
            console.error('Download failed:', error);
            throw error;
        }
    }

    // Enhanced UI Helpers with better error handling
    showLoadingState() {
        try {
            const loadingPanel = document.getElementById('loadingPanel');
            const emptyState = document.getElementById('emptyState');
            const prospectsContainer = document.getElementById('prospectsContainer');

            loadingPanel?.classList.remove('hidden');
            emptyState?.classList.add('hidden');

            if (prospectsContainer) {
                prospectsContainer.innerHTML = '';
            }
        } catch (error) {
            console.error('Error showing loading state:', error);
        }
    }

    hideLoadingState() {
        try {
            const loadingPanel = document.getElementById('loadingPanel');
            loadingPanel?.classList.add('hidden');
        } catch (error) {
            console.error('Error hiding loading state:', error);
        }
    }

    updateProgress(percent, text) {
        try {
            const progressBar = document.getElementById('progressBar');
            const progressText = document.getElementById('progressText');

            if (progressBar) {
                progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
            }

            if (progressText) {
                progressText.textContent = SecurityUtils.escapeHTML(text);
            }
        } catch (error) {
            console.error('Error updating progress:', error);
        }
    }

    showError(message) {
        try {
            const errorMessage = document.getElementById('errorMessage');
            const errorPanel = document.getElementById('errorPanel');

            if (errorMessage) {
                errorMessage.textContent = SecurityUtils.escapeHTML(message);
            }

            if (errorPanel) {
                errorPanel.classList.remove('hidden');

                // Auto-hide after 15 seconds
                setTimeout(() => {
                    errorPanel.classList.add('hidden');
                }, 15000);
            }
        } catch (error) {
            console.error('Error showing error:', error);
        }
    }

    showToast(message, type = 'info', duration = 4000) {
        try {
            const toastContainer = document.getElementById('toastContainer');
            if (!toastContainer) return;

            const toast = document.createElement('div');

            const bgColor = {
                success: 'bg-green-500',
                error: 'bg-red-500',
                warning: 'bg-yellow-500',
                info: 'bg-blue-500'
            }[type] || 'bg-blue-500';

            toast.className = `${bgColor} text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full opacity-0 max-w-sm`;
            toast.textContent = SecurityUtils.escapeHTML(message);

            toastContainer.appendChild(toast);

            // Animate in
            setTimeout(() => {
                toast.classList.remove('translate-x-full', 'opacity-0');
            }, 100);

            // Animate out and remove
            setTimeout(() => {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => {
                    if (toastContainer.contains(toast)) {
                        toastContainer.removeChild(toast);
                    }
                }, 300);
            }, duration);

        } catch (error) {
            console.error('Error showing toast:', error);
        }
    }

    // Configuration Modal with enhanced validation
    openConfig() {
        try {
            const modal = document.getElementById('configModal');
            modal?.classList.remove('hidden');

            // Populate form with current config
            const apiKeyInput = document.getElementById('apiKeyInput');
            const subredditsInput = document.getElementById('subredditsInput');
            const desiredSignalsInput = document.getElementById('desiredSignalsInput');
            const avoidSignalsInput = document.getElementById('avoidSignalsInput');
            const includeKeywordsInput = document.getElementById('includeKeywordsInput');
            const avoidKeywordsInput = document.getElementById('avoidKeywordsInput');
            const profileContextInput = document.getElementById('profileContextInput');
            const minScoreInput = document.getElementById('minScoreInput');
            const maxResultsInput = document.getElementById('maxResultsInput');

            if (apiKeyInput) apiKeyInput.value = this.config.apiKey || '';
            if (subredditsInput) subredditsInput.value = this.config.subreddits.join(',');
            if (includeKeywordsInput) includeKeywordsInput.value = (this.config.includeKeywords || []).join(', ');
            if (avoidKeywordsInput) avoidKeywordsInput.value = (this.config.avoidKeywords || []).join(', ');
            if (desiredSignalsInput) desiredSignalsInput.value = this.config.desiredSignals || '';
            if (avoidSignalsInput) avoidSignalsInput.value = this.config.avoidSignals || '';
            if (profileContextInput) profileContextInput.checked = Boolean(this.config.profileContext);
            if (minScoreInput) minScoreInput.value = this.config.minScore.toFixed(1);
            if (maxResultsInput) maxResultsInput.value = this.config.maxResults.toString();

        } catch (error) {
            console.error('Error opening config:', error);
        }
    }

    closeConfig() {
        try {
            const modal = document.getElementById('configModal');
            modal?.classList.add('hidden');
        } catch (error) {
            console.error('Error closing config:', error);
        }
    }

    // Utility
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Global functions for HTML event handlers
function openConfig() {
    if (window.secureApp) {
        window.secureApp.openConfig();
    }
}

function closeConfig() {
    if (window.secureApp) {
        window.secureApp.closeConfig();
    }
}

function saveConfig() {
    if (window.secureApp) {
        window.secureApp.saveConfig();
    }
}

// Initialize the secure app
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.secureApp = new SecureCoachConnectApp();
    } catch (error) {
        console.error('Failed to initialize secure app:', error);
        document.body.innerHTML = '<div style="padding: 20px; background: #fee; border: 2px solid #fcc; margin: 20px; border-radius: 8px;"><h2>Application Error</h2><p>The application failed to load. Please refresh the page or check your browser console for details.</p></div>';
    }
});

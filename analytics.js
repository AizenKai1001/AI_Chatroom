/**
 * analytics.js - Analytics Dashboard functionality for the AI Chat Experience
 * This file handles all analytics-related features including:
 * - Usage metrics tracking
 * - Data visualization with charts
 * - Conversation statistics
 * - Response time monitoring
 * - Token usage tracking
 */

// Analytics state management
const AnalyticsModule = (() => {
    // Private variables
    let conversationStats = {
        totalMessages: 0,
        userMessages: 0,
        aiMessages: 0,
        avgResponseTime: 0,
        totalResponseTime: 0,
        messagesByDate: {},
        tokenUsage: {
            input: 0,
            output: 0,
            total: 0
        },
        imageCounts: 0,
        characterCounts: {
            user: 0,
            ai: 0
        },
        responseTimeHistory: [],
        lastQuery: null
    };
    
    // Message lengths for token estimation (rough approximation)
    const TOKENS_PER_CHAR = 0.25; // Very rough approximation
    
    // DOM Elements
    let analyticsPanel;
    let analyticsToggle;
    let messageCountElement;
    let avgResponseTimeElement;
    let tokenUsageElement;
    let imageCountElement;
    let messageRatioChart;
    let responseTimeChart;
    let tokenUsageChart;
    let messageHistoryTable;
    
    // Chart instances
    let messageRatioChartInstance = null;
    let responseTimeChartInstance = null;
    let tokenUsageChartInstance = null;
    
    // Initialization function
    const init = () => {
        // Get DOM elements
        analyticsPanel = document.getElementById('analyticsPanel');
        analyticsToggle = document.getElementById('analyticsToggle');
        messageCountElement = document.getElementById('messageCount');
        avgResponseTimeElement = document.getElementById('avgResponseTime');
        tokenUsageElement = document.getElementById('tokenUsage');
        imageCountElement = document.getElementById('imageCount');
        messageRatioChart = document.getElementById('messageRatioChart');
        responseTimeChart = document.getElementById('responseTimeChart');
        tokenUsageChart = document.getElementById('tokenUsageChart');
        messageHistoryTable = document.getElementById('messageHistory');
        
        // Load any saved stats from localStorage
        loadStats();
        
        // Initialize charts
        initCharts();
        
        // Add event listeners
        if (analyticsToggle) {
            analyticsToggle.addEventListener('click', toggleAnalyticsPanel);
        }
        
        // Initialize export button
        const exportBtn = document.getElementById('exportAnalytics');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportAnalyticsData);
        }
        
        // If there are filters, add event listeners
        const timeFilter = document.getElementById('timeFilter');
        if (timeFilter) {
            timeFilter.addEventListener('change', updateCharts);
        }
    };
    
    // Toggle analytics panel visibility
    const toggleAnalyticsPanel = () => {
        if (!analyticsPanel) return;
        
        if (analyticsPanel.style.display === 'none' || analyticsPanel.style.display === '') {
            analyticsPanel.style.display = 'block';
            analyticsToggle.classList.add('active');
            // Update charts whenever panel is opened
            updateCharts();
        } else {
            analyticsPanel.style.display = 'none';
            analyticsToggle.classList.remove('active');
        }
    };
    
    // Load stats from localStorage
    const loadStats = () => {
        const savedStats = localStorage.getItem('conversationStats');
        if (savedStats) {
            try {
                conversationStats = JSON.parse(savedStats);
            } catch (e) {
                console.error('Error parsing saved stats:', e);
                // Reset to defaults if there's an error
                resetStats();
            }
        }
    };
    
    // Save stats to localStorage
    const saveStats = () => {
        localStorage.setItem('conversationStats', JSON.stringify(conversationStats));
    };
    
    // Reset all stats
    const resetStats = () => {
        conversationStats = {
            totalMessages: 0,
            userMessages: 0,
            aiMessages: 0,
            avgResponseTime: 0,
            totalResponseTime: 0,
            messagesByDate: {},
            tokenUsage: {
                input: 0,
                output: 0,
                total: 0
            },
            imageCounts: 0,
            characterCounts: {
                user: 0,
                ai: 0
            },
            responseTimeHistory: [],
            lastQuery: null
        };
        saveStats();
        updateUI();
    };
    
    // Track when a message is sent by user
    const trackUserMessage = (message) => {
        conversationStats.userMessages++;
        conversationStats.totalMessages++;
        conversationStats.characterCounts.user += message.length;
        
        // Estimate token usage (this is approximate)
        const estimatedTokens = Math.ceil(message.length * TOKENS_PER_CHAR);
        conversationStats.tokenUsage.input += estimatedTokens;
        conversationStats.tokenUsage.total += estimatedTokens;
        
        // Track by date
        const today = new Date().toISOString().split('T')[0];
        if (!conversationStats.messagesByDate[today]) {
            conversationStats.messagesByDate[today] = {
                user: 0,
                ai: 0
            };
        }
        conversationStats.messagesByDate[today].user++;
        
        // Record time for response time calculation
        conversationStats.lastQuery = Date.now();
        
        saveStats();
        updateUI();
    };
    
    // Track when an image is uploaded
    const trackImageUpload = () => {
        conversationStats.imageCounts++;
        saveStats();
        updateUI();
    };
    
    // Track when a response is received from the AI
    const trackAIResponse = (response) => {
        conversationStats.aiMessages++;
        conversationStats.totalMessages++;
        conversationStats.characterCounts.ai += response.length;
        
        // Calculate response time if there was a previous query
        if (conversationStats.lastQuery) {
            const responseTime = (Date.now() - conversationStats.lastQuery) / 1000; // in seconds
            conversationStats.responseTimeHistory.push({
                time: new Date().toISOString(),
                duration: responseTime
            });
            
            // Update average response time
            conversationStats.totalResponseTime += responseTime;
            conversationStats.avgResponseTime = 
                conversationStats.totalResponseTime / conversationStats.responseTimeHistory.length;
        }
        
        // Reset last query
        conversationStats.lastQuery = null;
        
        // Estimate token usage (this is approximate)
        const estimatedTokens = Math.ceil(response.length * TOKENS_PER_CHAR);
        conversationStats.tokenUsage.output += estimatedTokens;
        conversationStats.tokenUsage.total += estimatedTokens;
        
        // Track by date
        const today = new Date().toISOString().split('T')[0];
        if (!conversationStats.messagesByDate[today]) {
            conversationStats.messagesByDate[today] = {
                user: 0,
                ai: 0
            };
        }
        conversationStats.messagesByDate[today].ai++;
        
        saveStats();
        updateUI();
    };
    
    // Initialize chart objects
    const initCharts = () => {
        // Only initialize if elements exist and charts don't
        if (messageRatioChart && !messageRatioChartInstance) {
            const ctx = messageRatioChart.getContext('2d');
            messageRatioChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['User Messages', 'AI Responses'],
                    datasets: [{
                        data: [conversationStats.userMessages, conversationStats.aiMessages],
                        backgroundColor: [
                            'rgba(74, 110, 224, 0.7)',
                            'rgba(110, 66, 211, 0.7)'
                        ],
                        borderColor: [
                            'rgba(74, 110, 224, 1)',
                            'rgba(110, 66, 211, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color')
                            }
                        }
                    }
                }
            });
        }
        
        if (responseTimeChart && !responseTimeChartInstance) {
            const ctx = responseTimeChart.getContext('2d');
            responseTimeChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: conversationStats.responseTimeHistory.map((item, index) => `Query ${index + 1}`),
                    datasets: [{
                        label: 'Response Time (seconds)',
                        data: conversationStats.responseTimeHistory.map(item => item.duration),
                        borderColor: 'rgba(110, 66, 211, 1)',
                        backgroundColor: 'rgba(110, 66, 211, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color')
                            },
                            grid: {
                                color: 'rgba(200, 200, 200, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color')
                            },
                            grid: {
                                color: 'rgba(200, 200, 200, 0.1)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color')
                            }
                        }
                    }
                }
            });
        }
        
        if (tokenUsageChart && !tokenUsageChartInstance) {
            const ctx = tokenUsageChart.getContext('2d');
            tokenUsageChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Input', 'Output', 'Total'],
                    datasets: [{
                        label: 'Token Usage',
                        data: [
                            conversationStats.tokenUsage.input,
                            conversationStats.tokenUsage.output,
                            conversationStats.tokenUsage.total
                        ],
                        backgroundColor: [
                            'rgba(74, 110, 224, 0.7)',
                            'rgba(110, 66, 211, 0.7)',
                            'rgba(255, 123, 156, 0.7)'
                        ],
                        borderColor: [
                            'rgba(74, 110, 224, 1)',
                            'rgba(110, 66, 211, 1)',
                            'rgba(255, 123, 156, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color')
                            },
                            grid: {
                                color: 'rgba(200, 200, 200, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: getComputedStyle(document.body).getPropertyValue('--text-color')
                            },
                            grid: {
                                color: 'rgba(200, 200, 200, 0.1)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
        }
    };
    
    // Update all charts with the latest data
    const updateCharts = () => {
        if (messageRatioChartInstance) {
            messageRatioChartInstance.data.datasets[0].data = [
                conversationStats.userMessages, 
                conversationStats.aiMessages
            ];
            messageRatioChartInstance.update();
        }
        
        if (responseTimeChartInstance) {
            // Apply time filter if available
            let filteredHistory = [...conversationStats.responseTimeHistory];
            const timeFilter = document.getElementById('timeFilter');
            
            if (timeFilter) {
                const filterValue = timeFilter.value;
                const now = new Date();
                
                if (filterValue === 'today') {
                    const today = new Date().toISOString().split('T')[0];
                    filteredHistory = filteredHistory.filter(item => 
                        item.time.startsWith(today));
                } else if (filterValue === 'week') {
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    filteredHistory = filteredHistory.filter(item => 
                        new Date(item.time) >= weekAgo);
                } else if (filterValue === 'month') {
                    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    filteredHistory = filteredHistory.filter(item => 
                        new Date(item.time) >= monthAgo);
                }
            }
            
            responseTimeChartInstance.data.labels = 
                filteredHistory.map((item, index) => `Query ${index + 1}`);
            responseTimeChartInstance.data.datasets[0].data = 
                filteredHistory.map(item => item.duration);
            responseTimeChartInstance.update();
        }
        
        if (tokenUsageChartInstance) {
            tokenUsageChartInstance.data.datasets[0].data = [
                conversationStats.tokenUsage.input,
                conversationStats.tokenUsage.output,
                conversationStats.tokenUsage.total
            ];
            tokenUsageChartInstance.update();
        }
        
        // Update message history table
        updateMessageHistoryTable();
    };
    
    // Update the message history table
    const updateMessageHistoryTable = () => {
        if (!messageHistoryTable) return;
        
        // Clear existing rows
        while (messageHistoryTable.rows.length > 1) {
            messageHistoryTable.deleteRow(1);
        }
        
        // Convert messagesByDate to array for sorting
        const messageHistory = Object.entries(conversationStats.messagesByDate)
            .map(([date, counts]) => ({
                date,
                ...counts
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date, newest first
        
        // Add new rows
        messageHistory.forEach(day => {
            const row = messageHistoryTable.insertRow();
            
            const dateCell = row.insertCell();
            const formattedDate = new Date(day.date).toLocaleDateString();
            dateCell.textContent = formattedDate;
            
            const userCell = row.insertCell();
            userCell.textContent = day.user;
            
            const aiCell = row.insertCell();
            aiCell.textContent = day.ai;
            
            const totalCell = row.insertCell();
            totalCell.textContent = day.user + day.ai;
        });
    };
    
    // Update UI elements with latest stats
    const updateUI = () => {
        if (messageCountElement) {
            messageCountElement.textContent = conversationStats.totalMessages;
        }
        
        if (avgResponseTimeElement) {
            avgResponseTimeElement.textContent = 
                conversationStats.avgResponseTime.toFixed(2) + 's';
        }
        
        if (tokenUsageElement) {
            tokenUsageElement.textContent = conversationStats.tokenUsage.total;
        }
        
        if (imageCountElement) {
            imageCountElement.textContent = conversationStats.imageCounts;
        }
    };
    
    // Export analytics data to CSV
    const exportAnalyticsData = () => {
        // Prepare data
        let csvContent = "data:text/csv;charset=utf-8,";
        
        // Add summary stats
        csvContent += "Summary Statistics\r\n";
        csvContent += "Total Messages," + conversationStats.totalMessages + "\r\n";
        csvContent += "User Messages," + conversationStats.userMessages + "\r\n";
        csvContent += "AI Messages," + conversationStats.aiMessages + "\r\n";
        csvContent += "Average Response Time (s)," + conversationStats.avgResponseTime.toFixed(2) + "\r\n";
        csvContent += "Total Token Usage," + conversationStats.tokenUsage.total + "\r\n";
        csvContent += "Input Tokens," + conversationStats.tokenUsage.input + "\r\n";
        csvContent += "Output Tokens," + conversationStats.tokenUsage.output + "\r\n";
        csvContent += "Images Analyzed," + conversationStats.imageCounts + "\r\n\r\n";
        
        // Add daily message history
        csvContent += "Daily Message History\r\n";
        csvContent += "Date,User Messages,AI Messages,Total\r\n";
        
        Object.entries(conversationStats.messagesByDate)
            .sort((a, b) => new Date(a[0]) - new Date(b[0])) // Sort by date
            .forEach(([date, counts]) => {
                csvContent += `${date},${counts.user},${counts.ai},${counts.user + counts.ai}\r\n`;
            });
        
        csvContent += "\r\n";
        
        // Add response time history
        csvContent += "Response Time History\r\n";
        csvContent += "Timestamp,Duration (s)\r\n";
        
        conversationStats.responseTimeHistory.forEach(item => {
            csvContent += `${item.time},${item.duration.toFixed(2)}\r\n`;
        });
        
        // Create download link
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "chat_analytics_" + new Date().toISOString().split('T')[0] + ".csv");
        document.body.appendChild(link);
        
        // Trigger download
        link.click();
        document.body.removeChild(link);
    };
    
    // Listen for theme changes to update chart colors
    const updateChartsTheme = () => {
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-color');
        const gridColor = 'rgba(200, 200, 200, 0.1)';
        
        // Update chart themes
        if (messageRatioChartInstance) {
            messageRatioChartInstance.options.plugins.legend.labels.color = textColor;
            messageRatioChartInstance.update();
        }
        
        if (responseTimeChartInstance) {
            responseTimeChartInstance.options.scales.y.ticks.color = textColor;
            responseTimeChartInstance.options.scales.x.ticks.color = textColor;
            responseTimeChartInstance.options.scales.y.grid.color = gridColor;
            responseTimeChartInstance.options.scales.x.grid.color = gridColor;
            responseTimeChartInstance.options.plugins.legend.labels.color = textColor;
            responseTimeChartInstance.update();
        }
        
        if (tokenUsageChartInstance) {
            tokenUsageChartInstance.options.scales.y.ticks.color = textColor;
            tokenUsageChartInstance.options.scales.x.ticks.color = textColor;
            tokenUsageChartInstance.options.scales.y.grid.color = gridColor;
            tokenUsageChartInstance.options.scales.x.grid.color = gridColor;
            tokenUsageChartInstance.update();
        }
    };
    
    // Public API
    return {
        init,
        trackUserMessage,
        trackAIResponse,
        trackImageUpload,
        resetStats,
        toggleAnalyticsPanel,
        updateChartsTheme
    };
})();

// Initialize analytics when document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if Chart.js is loaded
    if (typeof Chart !== 'undefined') {
        AnalyticsModule.init();
    } else {
        // If Chart.js isn't loaded yet, load it dynamically
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = () => AnalyticsModule.init();
        document.head.appendChild(script);
    }
    
    // Listen for theme changes
    const themeToggle = document.getElementById('checkbox');
    if (themeToggle) {
        themeToggle.addEventListener('change', AnalyticsModule.updateChartsTheme);
    }
});

// Export the module for use in other scripts
window.AnalyticsModule = AnalyticsModule;
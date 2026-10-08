// Shared Chart.js palette/options so every chart in the dashboard matches
// the light, storefront-inspired theme instead of each page hand-rolling colors.

export const chartColors = {
    accent: '#d9642c',
    accentSoft: 'rgba(217, 100, 44, 0.14)',
    success: '#2f8f5b',
    successSoft: 'rgba(47, 143, 91, 0.14)',
    info: '#2f6fa8',
    infoSoft: 'rgba(47, 111, 168, 0.14)',
    ink: '#221d17',
    inkSoft: '#6b6258',
    border: '#e8e2d8',
    palette: ['#d9642c', '#2f6fa8', '#2f8f5b', '#b7791f', '#8a5cb0', '#c0392b'],
};

export const chartBaseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: {
                color: chartColors.inkSoft,
                font: { family: 'Inter', size: 12, weight: '600' },
                usePointStyle: true,
                boxWidth: 8,
            },
        },
        tooltip: {
            backgroundColor: '#ffffff',
            titleColor: chartColors.ink,
            bodyColor: chartColors.inkSoft,
            borderColor: chartColors.border,
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            boxPadding: 4,
        },
    },
    scales: {
        x: {
            grid: { display: false },
            ticks: { color: chartColors.inkSoft, font: { family: 'Inter', size: 11 } },
        },
        y: {
            grid: { color: chartColors.border },
            ticks: { color: chartColors.inkSoft, font: { family: 'Inter', size: 11 } },
            beginAtZero: true,
        },
    },
};

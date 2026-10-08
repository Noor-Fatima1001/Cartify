import React from 'react';

const ChartCard = ({ title, children }) => (
    <div className="dash-chart-card">
        <div className="dash-chart-card-title">{title}</div>
        <div className="dash-chart-card-body">{children}</div>
    </div>
);

export default ChartCard;

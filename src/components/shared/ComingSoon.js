import React from 'react';
import './ComingSoon.css';

const ComingSoon = ({ title, description, planned, restricted }) => (
  <div className="coming-soon">
    <div className="coming-soon-icon">🚧</div>
    <h2>{title}</h2>
    <p>{description}</p>
    {planned && <div className="badge planned">Planned: {planned}</div>}
    {restricted && <div className="badge restricted">{restricted}</div>}
  </div>
);

export default ComingSoon;

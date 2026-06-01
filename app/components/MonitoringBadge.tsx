'use client';

import { useEffect, useState } from 'react';

export function MonitoringBadge({ stationId, onMonitoringStatus }) {
  const [monitoring, setMonitoring] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);

  useEffect(() => {
    // Obtener monitoreo activo para esta estación
    const fetchMonitoring = async () => {
      try {
        const response = await fetch(`/api/monitoring?station_id=${stationId}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            setMonitoring(data[0]);
            onMonitoringStatus?.(true);
          } else {
            setMonitoring(null);
            onMonitoringStatus?.(false);
          }
        }
      } catch (error) {
        console.error('[v0] Error fetching monitoring:', error);
      }
    };

    fetchMonitoring();
    const interval = setInterval(fetchMonitoring, 30000); // Cada 30 segundos

    return () => clearInterval(interval);
  }, [stationId, onMonitoringStatus]);

  // Actualizar tiempo restante cada segundo
  useEffect(() => {
    if (!monitoring) return;

    const updateTimer = () => {
      const endTime = new Date(monitoring.end_time);
      const now = new Date();
      const remaining = Math.ceil((endTime.getTime() - now.getTime()) / 1000 / 60);
      
      if (remaining > 0) {
        setTimeRemaining(remaining);
      } else {
        // Monitoreo expirado, detenerlo
        setMonitoring(null);
        onMonitoringStatus?.(false);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Cada minuto

    return () => clearInterval(interval);
  }, [monitoring, onMonitoringStatus]);

  if (!monitoring) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-green-900/30 border border-green-600 rounded text-green-400 text-sm font-semibold">
      <span className="animate-pulse">●</span>
      <span>Monitoreando: {timeRemaining}m</span>
    </div>
  );
}

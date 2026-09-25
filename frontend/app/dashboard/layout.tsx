'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { ThemeProvider } from '@/lib/theme-context';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <ThemeProvider>
      <div style={{ display: 'flex', height: '100vh', width: '100%', maxWidth: '100vw', overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Sidebar (Closed by default as requested) */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        {/* Main Content Area (Full Height Workspace, No Top Bar) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Child View Workspace */}
          <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}

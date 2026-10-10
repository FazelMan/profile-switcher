import { Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * A minimal native menu: standard app/edit/window roles so copy/paste and
 * keyboard shortcuts work as users expect, plus reload/devtools only in
 * development builds.
 */
export function buildApplicationMenu(options: { isPackaged: boolean }): Menu {
  const template: MenuItemConstructorOptions[] = [];
  if (process.platform === 'darwin') template.push({ role: 'appMenu' });
  template.push({ role: 'fileMenu' }, { role: 'editMenu' });
  const viewItems: MenuItemConstructorOptions[] = [
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
  if (!options.isPackaged)
    viewItems.unshift({ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' });
  template.push({ label: 'View', submenu: viewItems }, { role: 'windowMenu' });
  return Menu.buildFromTemplate(template);
}

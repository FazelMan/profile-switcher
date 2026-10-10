import { Menu, type MenuItemConstructorOptions } from 'electron';
import { fill, type NativeStrings } from './native-strings';

/**
 * A minimal native menu: standard app/edit/window roles so copy/paste and
 * keyboard shortcuts work as users expect, plus reload/devtools only in
 * development builds. Labels follow Profile Switcher's language setting.
 */
export function buildApplicationMenu(options: {
  isPackaged: boolean;
  strings: NativeStrings;
  appName: string;
}): Menu {
  const t = options.strings.menu;
  const app = { app: options.appName };
  const mac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [];
  if (mac) {
    template.push({
      label: options.appName,
      submenu: [
        { role: 'about', label: fill(t.about, app) },
        { type: 'separator' },
        { role: 'services', label: t.services },
        { type: 'separator' },
        { role: 'hide', label: fill(t.hide, app) },
        { role: 'hideOthers', label: t.hideOthers },
        { role: 'unhide', label: t.unhide },
        { type: 'separator' },
        { role: 'quit', label: t.quit },
      ],
    });
  }
  template.push(
    {
      label: t.file,
      submenu: [mac ? { role: 'close', label: t.close } : { role: 'quit', label: t.quit }],
    },
    {
      label: t.edit,
      submenu: [
        { role: 'undo', label: t.undo },
        { role: 'redo', label: t.redo },
        { type: 'separator' },
        { role: 'cut', label: t.cut },
        { role: 'copy', label: t.copy },
        { role: 'paste', label: t.paste },
        { role: 'selectAll', label: t.selectAll },
      ],
    },
  );
  const viewItems: MenuItemConstructorOptions[] = [
    { role: 'resetZoom', label: t.resetZoom },
    { role: 'zoomIn', label: t.zoomIn },
    { role: 'zoomOut', label: t.zoomOut },
    { type: 'separator' },
    { role: 'togglefullscreen', label: t.toggleFullScreen },
  ];
  if (!options.isPackaged)
    viewItems.unshift(
      { role: 'reload', label: t.reload },
      { role: 'toggleDevTools', label: t.toggleDevTools },
      { type: 'separator' },
    );
  template.push(
    { label: t.view, submenu: viewItems },
    {
      label: t.window,
      submenu: mac
        ? [
            { role: 'minimize', label: t.minimize },
            { role: 'zoom', label: t.zoom },
            { type: 'separator' },
            { role: 'front', label: t.front },
          ]
        : [
            { role: 'minimize', label: t.minimize },
            { role: 'close', label: t.close },
          ],
    },
  );
  return Menu.buildFromTemplate(template);
}

import { Maybe, F, Tick } from 'vod-fp-utility';
import { ACTION } from '../store';

const { curry } = F;

const CLASSNMAE = {
  VOD_MENU_CLASSNAME: 'vod-context-menu',
  VOD_MENU_CLOSE: 'vod-menu-close',
  VOD_DEBUG_BTN: 'vod-debug-btn',
  VOD_DEBUG_INFO: 'vod-debug-info',
  VOD_DEBUG_INFO_CLOSE: 'vod-debug-info-close',
  VOD_DEBUG_INFO_AREA: 'vod-debug-info-area'
};

const defaultStyle = {
  position: 'absolute',
  padding: '10px',
  'font-size': '12px',
  background: '#000',
  opacity: '0.8',
  color: 'white'
};

const closeIconStyle = {
  'text-align': 'right',
  cursor: 'pointer'
};

const debugInfoUlStyle = {
  'list-style': 'none',
  padding: 0,
  'text-align': 'left'
};

const debugInfoItemStyle = {
  display: 'inline-block',
  width: '100px',
  'text-align': 'right',
  'margin-right': '20px'
};

function _initDebugWindow(container, connect) {
  let _window;
  let _task;
  _window = container.querySelector(`.${CLASSNMAE.VOD_DEBUG_INFO}`);
  if (_window) {
    _window.style.display = 'block';
    _task = _startFlush(_window, connect);
    return;
  }
  _window = document.createElement('div');
  _window.className = CLASSNMAE.VOD_DEBUG_INFO;
  _window.style.width = '220px';
  _window.style.left = `20px`;
  _window.style.top = `20px`;
  Object.assign(_window.style, defaultStyle);
  _window.innerHTML = `
    <div style="${_parseStyleStr(closeIconStyle)}" class="${
    CLASSNMAE.VOD_DEBUG_INFO_CLOSE
  }">X</div>
    <div class="${CLASSNMAE.VOD_DEBUG_INFO_AREA}"></div>
  `;
  _window.addEventListener('click', e => {
    if (e.target.className === CLASSNMAE.VOD_DEBUG_INFO_CLOSE) {
      _window.style.display = 'none';
      if (_task) {
        _task.stop();
      }
    }
  });
  container.appendChild(_window);
  _task = _startFlush(_window, connect);
}

function _startFlush(container, connect) {
  let ele = container.querySelector(`.${CLASSNMAE.VOD_DEBUG_INFO_AREA}`);
  return Tick.of()
    .addTask(() => {
      _renderDebugInfo(connect(_collectDebugInfo), ele);
    })
    .interval(500)
    .immediateRun();
}

function _collectDebugInfo({ getState, getConfig }) {
  return Maybe.of(
    curry((bufferInfo, flyBufferInfo, videoInfo, audioInfo) => {
      return {
        bufferInfo:
          bufferInfo.bufferLength.toFixed(2) +
          ' / ' +
          getConfig(ACTION.CONFIG.MAX_BUFFER_LENGTH),
        flyBufferInfo:
          flyBufferInfo.bufferLength.toFixed(2) +
          ' / ' +
          getConfig(ACTION.CONFIG.MAX_FLY_BUFFER_LENGTH),
        format: getState(ACTION.PLAYLIST.FORMAT),
        mode: getState(ACTION.PLAYLIST.MODE),
        videoWidth: videoInfo.width,
        videoHeight: videoInfo.height,
        videoCodec: videoInfo.codec,
        fps: videoInfo.fps,
        audioCodec: audioInfo.codec,
        samplerate: audioInfo.samplerate
      };
    })
  )
    .ap(getState(ACTION.BUFFER.GET_BUFFER_INFO))
    .ap(getState(ACTION.BUFFER.GET_FLY_BUFFER_INFO))
    .ap(getState(ACTION.BUFFER.VIDEO_INFO))
    .ap(getState(ACTION.BUFFER.AUDIO_INFO))
    .join();
}

function _parseStyleStr(styles) {
  return Object.keys(styles)
    .map(key => `${key}:${styles[key]}`)
    .join(';');
}

function _renderDebugInfo(info, ele) {
  let _lis = [
    'format',
    'mode',
    'videoCodec',
    'audioCodec',
    'videoWidth',
    'videoHeight',
    'samplerate',
    'fps',
    'bufferInfo',
    'flyBufferInfo'
  ]
    .map(x => {
      return `<li><span style="${_parseStyleStr(
        debugInfoItemStyle
      )}">${x}:</span>${info[x]}</li>`;
    })
    .join('\n');

  ele.innerHTML = `<div><ul style="${_parseStyleStr(
    debugInfoUlStyle
  )}">${_lis}</ul></div>`;
}

function _renderContextMenu(pointX, pointY, container, connect) {
  let menu;
  menu = container.querySelector(`.${CLASSNMAE.VOD_MENU_CLASSNAME}`);
  if (menu) {
    menu.style.left = `${pointX}px`;
    menu.style.top = `${pointY}px`;
    menu.style.display = 'block';
    return;
  }
  menu = document.createElement('div');
  menu.className = CLASSNMAE.VOD_MENU_CLASSNAME;
  menu.style.width = '80px';
  menu.style.left = `${pointX}px`;
  menu.style.top = `${pointY}px`;
  Object.assign(menu.style, defaultStyle);
  menu.innerHTML = `
    <div style="${_parseStyleStr(closeIconStyle)}" class="${
    CLASSNMAE.VOD_MENU_CLOSE
  }">X</div>
    <div style="cursor:pointer" class="${
      CLASSNMAE.VOD_DEBUG_BTN
    }">调试信息</div>
  `;
  menu.addEventListener('click', e => {
    switch (e.target.className) {
      case CLASSNMAE.VOD_MENU_CLOSE:
        menu.style.display = 'none';
        break;
      case CLASSNMAE.VOD_DEBUG_BTN:
        menu.style.display = 'none';
        _initDebugWindow(container, connect);
        break;
    }
  });
  container.appendChild(menu);
}

function _bindEvent(container, connect) {
  container.addEventListener('contextmenu', e => {
    e.preventDefault();
    _renderContextMenu(e.offsetX, e.offsetY, container, connect);
  });
}

function debuger({ connect }, container) {
  _bindEvent(container, connect);
}

export default curry(debuger);
import { useCallback, useEffect, useState } from "react";
import { createEmptySong, createSampleSong } from "./model/factory";
import { touch } from "./model/songOps";
import { DEFAULT_SETTINGS, type DisplaySettings, type Song } from "./model/types";
import { EditScreen, type EditTab } from "./screens/edit/EditScreen";
import { PlayScreen } from "./screens/PlayScreen";
import { SongList } from "./screens/SongList";
import { VERSION_LABEL } from "./version";
import { exportSongs, importSongs, loadState, saveState, SCHEMA_VERSION, type AppState } from "./storage/repository";

type Screen =
  | { kind: "list" }
  | { kind: "play"; songId: string; startEditing?: boolean }
  | { kind: "edit"; songId: string; tab?: EditTab; chordId?: string };

function initialState(): AppState {
  const loaded = loadState();
  if (loaded) return loaded;
  const sample = createSampleSong();
  return { schemaVersion: SCHEMA_VERSION, songs: [sample], settings: DEFAULT_SETTINGS, lastSongId: sample.id };
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [screen, setScreen] = useState<Screen>(() =>
    state.lastSongId && state.songs.some((s) => s.id === state.lastSongId)
      ? { kind: "play", songId: state.lastSongId }
      : { kind: "list" },
  );
  const [selectedChordId, setSelectedChordId] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | null>(null);

  // すべての変更をブラウザに保存する
  useEffect(() => {
    try {
      saveState(state);
      setSaveError(null);
    } catch (e) {
      setSaveError(`保存に失敗しました: ${(e as Error).message}`);
    }
  }, [state]);

  const song = "songId" in screen ? state.songs.find((s) => s.id === screen.songId) : undefined;

  useEffect(() => {
    if ("songId" in screen && !song) setScreen({ kind: "list" });
  }, [screen, song]);

  const replaceSong = useCallback((next: Song) => {
    setState((st) => ({ ...st, songs: st.songs.map((s) => (s.id === next.id ? touch(next) : s)) }));
  }, []);

  const setSettings = useCallback((settings: DisplaySettings) => setState((st) => ({ ...st, settings })), []);

  const openSong = (id: string) => {
    setSelectedChordId(undefined);
    setState((st) => ({ ...st, lastSongId: id }));
    setScreen({ kind: "play", songId: id });
  };

  const addSong = (s: Song) => {
    setState((st) => ({ ...st, songs: [...st.songs, s], lastSongId: s.id }));
    return s;
  };

  let body;
  if (screen.kind === "play" && song) {
    body = (
      <PlayScreen
        song={song}
        settings={state.settings}
        onSettingsChange={setSettings}
        selectedChordId={selectedChordId}
        onSelectChord={setSelectedChordId}
        onSongChange={replaceSong}
        onEdit={(tab) =>
          setScreen({ kind: "edit", songId: song.id, tab: tab as EditTab | undefined, chordId: selectedChordId })
        }
        onBack={() => setScreen({ kind: "list" })}
        initialEditMode={screen.startEditing ? "chord" : "view"}
        initialSongInfo={!!screen.startEditing}
      />
    );
  } else if (screen.kind === "edit" && song) {
    body = (
      <EditScreen
        song={song}
        initialTab={screen.tab}
        focusChordId={screen.chordId}
        settings={state.settings}
        onSave={replaceSong}
        onClose={() => setScreen({ kind: "play", songId: song.id })}
      />
    );
  } else {
    body = (
      <SongList
        songs={state.songs}
        onOpen={openSong}
        onCreate={() => {
          const s = addSong(createEmptySong());
          setSelectedChordId(undefined);
          setScreen({ kind: "play", songId: s.id, startEditing: true });
        }}
        onAddSample={() => addSong(createSampleSong())}
        onDuplicate={(id) => {
          const src = state.songs.find((s) => s.id === id);
          if (src) {
            const [copy] = importSongs(exportSongs([src]));
            addSong({
              ...copy,
              title: `${src.title}（コピー）`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }}
        onDelete={(id) => setState((st) => ({ ...st, songs: st.songs.filter((s) => s.id !== id) }))}
        onExport={(ids) => {
          const songs = state.songs.filter((s) => ids.includes(s.id));
          const name = songs.length === 1 ? songs[0].title : `songs-${songs.length}`;
          download(`${name.replace(/[\\/:*?"<>|]/g, "_")}.json`, exportSongs(songs));
        }}
        onImport={async (file) => {
          try {
            const songs = importSongs(await file.text());
            if (songs.length === 0) throw new Error("曲が含まれていません");
            setState((st) => ({ ...st, songs: [...st.songs, ...songs] }));
            window.alert(`${songs.length}曲を読み込みました。`);
          } catch (e) {
            window.alert(`読み込みに失敗しました: ${(e as Error).message}`);
          }
        }}
      />
    );
  }

  return (
    <div className="app">
      {saveError && (
        <div className="save-error" role="alert">
          {saveError}
        </div>
      )}
      {body}
      <footer className="app-footer" aria-label="バージョン">
        ギター演奏ノート {VERSION_LABEL}
      </footer>
    </div>
  );
}

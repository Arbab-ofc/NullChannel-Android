import { RoomCard } from './RoomCard';
import { AlertCircle, LockKeyhole, Plus, RefreshCw, UsersRound } from 'lucide-react';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Skeleton } from '../common/Skeleton';
import { PullToRefresh } from '../mobile/PullToRefresh';
import '../../styles/active-rooms.css';

export type ActiveRoom = {
  code: string;
  room_name: string;
  room_type: 'private' | 'group';
  expires_at: string;
};
type Props = {
  rooms: ActiveRoom[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  openRoom: (code: string) => void;
  createRoom: (kind: 'private' | 'group') => void;
};
const categories = [
  { kind: 'private', title: 'Private Rooms', description: 'Your private conversations', Icon: LockKeyhole },
  { kind: 'group', title: 'Group Rooms', description: 'Conversations with your people', Icon: UsersRound }
] as const;

/** Presentation only: the parent owns loading, refresh and existing room actions. */
export function ActiveRoomsSection({ rooms, loading, error, refresh, openRoom, createRoom }: Props) {
  const available = !loading && !error;
  return <section className="spaces-workspace" aria-labelledby="spaces-heading">
    <PullToRefresh refresh={refresh} showRefreshButton={false}>
      <header className="spaces-header">
        <div><p className="nc-eyebrow">YOUR WORKSPACE</p><h2 id="spaces-heading">Your Spaces</h2><p className="spaces-subtitle">Pick up where you left off.</p></div>
        {!error && <Button variant="ghost" disabled={loading} onClick={() => void refresh()} className="spaces-refresh" aria-label="Refresh your rooms"><RefreshCw aria-hidden="true"/><span>Refresh</span></Button>}
      </header>
      {error && !loading && <div role="alert" className="spaces-error">
        <span className="spaces-error__icon"><AlertCircle aria-hidden="true"/></span>
        <div><h3>Couldn't load your rooms</h3><p>We couldn't retrieve your rooms right now.</p></div>
        <Button onClick={() => void refresh()} className="spaces-retry"><RefreshCw aria-hidden="true"/>Retry</Button>
      </div>}
      {(!error || loading) && <div className="spaces-grid">
        {categories.map(({kind,title,description,Icon}) => {
          // Keep the existing six-entry preview while counting the full response.
          const categoryRooms = rooms.filter((room,index)=>rooms.findIndex(candidate=>candidate.code===room.code)===index).filter(room => (room.room_type ?? 'private') === kind);
          return <section key={kind} className={`space-category space-category--${kind}`} aria-labelledby={`spaces-${kind}-heading`}>
            <header className="space-category__header">
              <span className="space-category__icon"><Icon aria-hidden="true"/></span>
              <div><h3 id={`spaces-${kind}-heading`}>{title}</h3><p>{description}</p></div>
              {available && <span className="space-category__count" aria-label={`${categoryRooms.length} ${kind === 'private' ? 'private' : 'group'} rooms`}>{categoryRooms.length}</span>}
            </header>
            {loading ? <Skeleton kind="rooms" label={`Loading ${title.toLowerCase()}`}/> : categoryRooms.length === 0 ?
              <EmptyState title="No rooms yet" description="Create a space and start a conversation."><Button className="space-create" onClick={() => createRoom(kind)}><Plus aria-hidden="true"/>Create {kind === 'private' ? 'private room' : 'group room'}</Button></EmptyState> :
              <ul className="space-room-list">{categoryRooms.slice(0,6).map(room => <li key={room.code}>
                <RoomCard room={room} open={openRoom}/>
              </li>)}</ul>}
            {available && categoryRooms.length > 6 && <p className="space-category__limit">Showing 6 of {categoryRooms.length} rooms</p>}
          </section>;
        })}
      </div>}
    </PullToRefresh>
  </section>;
}

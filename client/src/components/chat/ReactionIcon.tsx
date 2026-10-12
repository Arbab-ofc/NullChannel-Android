import { Eye, Flame, Heart, Smile, ThumbsUp } from 'lucide-react';
/** Wire values stay compatible with the existing backend; only presentation changes. */
export const reactions = [
  {value:'\u{1f44d}',label:'Like',Icon:ThumbsUp},
  {value:'\u{1f602}',label:'Laugh',Icon:Smile},
  {value:'\u{1f525}',label:'Fire',Icon:Flame},
  {value:'\u2764\ufe0f',label:'Love',Icon:Heart},
  {value:'\u{1f440}',label:'Seen',Icon:Eye}
];
export function reactionName(value:string) {return reactions.find(reaction=>reaction.value===value)?.label??'Reaction';}
export function ReactionIcon({value}:{value:string}) {const Icon=reactions.find(reaction=>reaction.value===value)?.Icon??Smile;return <Icon aria-hidden="true" size={17}/>;}

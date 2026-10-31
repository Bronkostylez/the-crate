/**
 * The review import template — single source of truth for the Import page
 * download buttons AND the static copies in public/import-templates/.
 * Fields match supabase migration + local schema.
 */
export const TEMPLATE_EXAMPLE_ROWS = [
  {
    artist: 'Nas',
    album_title: 'Illmatic',
    release_year: 1994,
    genres: 'East Coast Hip-Hop; Boom Bap',
    rating: 10,
    review: '(hier kommen deine eigenen Worte hin — werden wortgleich importiert, nie umgeschrieben)',
    best_tracks: 'The World Is Yours; N.Y. State of Mind',
    worst_tracks: '',
    review_date: '2024-05-01',
    tags: 'klassiker; five-mic',
    notes: '',
    artwork_url: '',
  },
]

export const TEMPLATE_JSON = JSON.stringify(TEMPLATE_EXAMPLE_ROWS, null, 2)

export const TEMPLATE_CSV = [
  'artist,album_title,release_year,genres,rating,review,best_tracks,worst_tracks,review_date,tags,notes,artwork_url',
  'Nas,Illmatic,1994,"East Coast Hip-Hop; Boom Bap",10,"(hier kommen deine eigenen Worte hin — werden wortgleich importiert, nie umgeschrieben)","The World Is Yours; N.Y. State of Mind",,2024-05-01,"classic; five-mic",,',
].join('\n')

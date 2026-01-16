let home = document.getElementById("home");

home.innerHTML += `<br><div class="row">
    <h3>DEMO CARDS</h3>
    <div class="cards">
        <div
            class="card"
            onclick="
                openArtist(
                    4664877,
                    'twenty one pilots',
                    'e884d40b-a2b3-4d5c-8f31-f4fc523ad506',
                )
            "
        >
            <img
                src="${PROXY_VALUE}https://resources.tidal.com/images/e884d40b/a2b3/4d5c/8f31/f4fc523ad506/160x160.jpg"
            />
            <div>twenty one pilots</div>
        </div>
        <div
            class="card"
            onclick="
                addToQueue({
                    id: 441821360,
                    title: 'Golden',
                    duration: 195,
                    replayGain: -11.01,
                    peak: 1,
                    allowStreaming: true,
                    streamReady: true,
                    payToStream: false,
                    adSupportedStreamReady: true,
                    djReady: true,
                    stemReady: false,
                    streamStartDate:
                        '2025-06-20T00:00:00.000+0000',
                    premiumStreamingOnly: false,
                    trackNumber: 4,
                    volumeNumber: 1,
                    version: null,
                    popularity: 84,
                    copyright:
                        '℗ 2025 Netflix Music LLC, under exclusive license to Visva Records / Republic Records, a division of UMG Recordings, Inc.',
                    bpm: 123,
                    key: 'G',
                    keyScale: null,
                    url: 'http://www.tidal.com/track/441821360',
                    isrc: 'QZ8BZ2513510',
                    editable: false,
                    explicit: false,
                    audioQuality: 'LOSSLESS',
                    audioModes: ['STEREO'],
                    mediaMetadata: {
                        tags: [
                            'LOSSLESS',
                            'HIRES_LOSSLESS',
                        ],
                    },
                    upload: false,
                    accessType: 'PUBLIC',
                    spotlighted: false,
                    artist: {
                        id: 62075550,
                        name: 'HUNTR/X',
                        handle: null,
                        type: 'MAIN',
                        picture:
                            '1fb53258-6ef7-4bc6-9973-14395cf7c9ad',
                    },
                    artists: [
                        {
                            id: 62075550,
                            name: 'HUNTR/X',
                            handle: null,
                            type: 'MAIN',
                            picture:
                                '1fb53258-6ef7-4bc6-9973-14395cf7c9ad',
                        },
                        {
                            id: 63053036,
                            name: 'EJAE',
                            handle: null,
                            type: 'MAIN',
                            picture: null,
                        },
                        {
                            id: 18472776,
                            name: 'AUDREY NUNA',
                            handle: null,
                            type: 'MAIN',
                            picture:
                                'b4721fd7-56c8-4a2e-98a6-697747497208',
                        },
                        {
                            id: 16015899,
                            name: 'REI AMI',
                            handle: null,
                            type: 'MAIN',
                            picture:
                                '917f98a9-4701-4e43-88a6-cd6eef801743',
                        },
                        {
                            id: 62075546,
                            name: 'KPop Demon Hunters Cast',
                            handle: null,
                            type: 'MAIN',
                            picture: null,
                        },
                    ],
                    album: {
                        id: 441821356,
                        title: 'KPop Demon Hunters (Soundtrack from the Netflix Film)',
                        cover: 'e9e6bf7e-9d45-45e4-b0e8-c5fad3af1b46',
                        vibrantColor: '#86dff4',
                        videoCover: null,
                    },
                    mixes: {
                        TRACK_MIX:
                            '001fca903b79288671efcad0c4c1a0',
                    },
                })
            "
        >
            <img
                src="${PROXY_VALUE}https://resources.tidal.com/images/e9e6bf7e/9d45/45e4/b0e8/c5fad3af1b46/160x160.jpg"
            />
            <div>Golden</div>
        </div>
        <div
            class="card"
            onclick="
                openAlbum({
                    id: 109485854,
                    title: 'IGOR',
                    duration: 2386,
                    streamReady: true,
                    payToStream: false,
                    adSupportedStreamReady: true,
                    djReady: true,
                    stemReady: false,
                    streamStartDate:
                        '2019-05-17T00:00:00.000+0000',
                    allowStreaming: true,
                    premiumStreamingOnly: false,
                    numberOfTracks: 12,
                    numberOfVideos: 0,
                    numberOfVolumes: 1,
                    releaseDate: '2019-05-17',
                    copyright:
                        '(P) 2019 Columbia Records, a Division of Sony Music Entertainment, as exclusive licensee',
                    type: 'ALBUM',
                    version: null,
                    url: 'http://www.tidal.com/album/109485854',
                    cover: '5b22b4ad-2358-4418-acae-2a2c226e5945',
                    vibrantColor: '#f3b2c5',
                    videoCover: null,
                    explicit: true,
                    upc: '886447710180',
                    popularity: 88,
                    audioQuality: 'LOSSLESS',
                    audioModes: ['STEREO'],
                    mediaMetadata: {
                        tags: [
                            'LOSSLESS',
                            'HIRES_LOSSLESS',
                        ],
                    },
                    upload: false,
                    artists: [
                        {
                            id: 3908662,
                            name: 'Tyler, The Creator',
                            handle: null,
                            type: 'MAIN',
                            picture:
                                'd120928f-84d4-43ab-a248-3cf683f3fe9d',
                        },
                    ],
                })
            "
        >
            <img
                src="${PROXY_VALUE}https://resources.tidal.com/images/5b22b4ad/2358/4418/acae/2a2c226e5945/160x160.jpg"
            />
            <div>IGOR</div>
        </div>
    </div>
</div>`;

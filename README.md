# PIANOTO -- Submission for the ISMIR'22 Late-Breaking Demos

| PIANOTO |
| :-----: |
| <img width="700" alt="A screenshot of the PIANOTO interface" src="https://user-images.githubusercontent.com/9104039/193407898-fa4fe8e7-4b4f-4389-83f8-e1f69892cdf6.png"> |
|**Expressive piano performances** creation|

This repository holds the source code for PIANOTO, a web-based, AI-assisted interactive music creation app.

**PIANOTO** helps you be the piano maestro that you deserve to be!

It is an A.I.-powered interactive MIDI piano roll, for mobile and desktop. Swipe on the musical representation to regenerate zones, always staying coherent with the context.

https://user-images.githubusercontent.com/9104039/193406815-5adf940a-de74-4bb0-a151-6f3e32ea9b6a.mp4

This app is based on *inpainting*, that is, the use of AI-models to transform images, sounds or sheets in a *local* fashion: just tell the model which zones of the media you'd like to transform (because you don't like it or because you'd like to see a variation of it!) and it will regenerate it for you. PIANOTO applies this concept to the creation of expressive piano performances, in MIDI format. Thanks to the intuitive interactions offered by inpainting, PIANOTO removes the need for cumbersome micro-level edits and works nicely on mobile as well!

This app can be built as a standalone Electron application and the main contents, located [under packages](packages/) are split according to the Electron app architecture principles.
The code for the web-client (which can be built on its for for in-browser usage) can be found [under packages/renderer](packages/renderer/).

#### :warning: BYOB (Bring Your Own Backend)
Note that the PIANOTO interface requires connection to an AI model for inference!
Don't panic though:
- :tada: We provide a compatible model (PIAv2) as a [Docker image](#running-the-model-locally) (GPU recommended).
- :alembic: The app is **model-agnostic**: you can try to use it in conjunction with **your own models**!

## Usage

You can [access the interface here](https://anonymousPIANOTO.github.io/pianoto_ismir_lbd_2022/)!

### Manual installation

We recommended using the `nvm` installation manager for Node.js, available
[here](https://github.com/nvm-sh/nvm#installing-and-updating).
The music-inpainting.ts apps are currently developed with `node v18.5.0` and `npm v8.15.0`.

We use the standard `npm` package manager.

The apps can be installed as follows:

```shell
git clone https://github.com/anonymousPIANOTO/pianoto_ismir_lbd_2022
cd pianoto_ismir_lbd_2022
npm install
```

Once this is done, the `music-inpainting.ts` Electron app (with live-reloading enabled for hacking) can be started with:

```shell
npm start
```

## Running the model locally

We **strongly** recommend running this image on a machine equipped with an NVIDIA CUDA-compatible GPU.

|Application|Model|Docker image|
|-----------|----|-----|
|**PIANOTO**|[PIAv3](https://ghadjeres.github.io/piano-inpainting-application/)|`public.ecr.aws/csl-music-team/piano_inpainting_app:v3`|

### Sample commands (with recommended arguments and parameters)

##### Reminders

* The `docker run` `-p` parameter takes a pair of ports of the form `CONTAINER_PORT:LOCALHOST_PORT`.
* You might need to run the following commands as root depending on your installation of Docker.


The following commands start an inference server with access to the GPU with index `0` and listening on port `5005` (adapt to your own convenience).

Run the command and leave the server running in the background. Then launch the `music-inpainting.ts` interface as described above, disable the "Use hosted API" and set the **Inpainting API address** input field to `http://localhost:5005`, that's it!

#### PIAv3

```shell
docker run -p 5000:5005 --rm --gpus 0 public.ecr.aws/csl-music-team/piano_inpainting_app:v3 serve
```

⚠️ Note the (required) additional `serve` command!

## Credits

Some icons used were made by [Freepik](https://www.flaticon.com/authors/freepik) from [www.flaticon.com].

## Acknowledgements

REDACTED FOR BLIND SUBMISSION

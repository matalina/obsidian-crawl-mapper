export const BASE_THEME = `
# Crawl Mapper base theme: loaded for every hex map, before any icon packs.

# This file is for use with text-mapper.
# https://alexschroeder.ch/cgit/text-mapper/about/

# Icons copyright (c) 2026 Alicia Wilkerson, licensed under CC BY-SA 4.0.
# https://creativecommons.org/licenses/by-sa/4.0/
# Icon packs are built from the repository's icons/<pack>/ folders.

default attributes fill="none" stroke="#ccc" stroke-width="3"

text font-size="20pt" dy="15px"
label font-size="20pt" dy="5px"
glow stroke="white" stroke-width="0pt"

ghost attributes fill="#f1f1f1"

road path attributes stroke="#666" stroke-width="3" fill-opacity="0" stroke-dasharray="10 10"
river path attributes stroke="#78c8f5" stroke-width="10" fill-opacity="0" stroke-linecap="round"
canyon path attributes stroke="black" stroke-width="24" fill="none" opacity="0.2"
border path attributes stroke="red" stroke-width="15" stroke-opacity="0.5" fill-opacity="0"
trail path attributes stroke="#e3bea3" stroke-width="6" fill="none" transform="translate(10,-10)"
trail-right path attributes stroke="#e3bea3" stroke-width="6" fill="none" transform="translate(20)"
trail-down path attributes stroke="#e3bea3" stroke-width="6" fill="none" transform="translate(0,20)"

<circle id="level" stroke="black" stroke-width="7" cx="60" cy="00" r="15"/>
<use id="level-3" xlink:href="#level" transform="scale(0.7)" fill="#1FA84F"/>
<use id="level-4" xlink:href="#level" transform="scale(0.7)" fill="#7BCB3A"/>
<use id="level-5" xlink:href="#level" transform="scale(0.7)" fill="#C7D92D"/>
<use id="level-6" xlink:href="#level" transform="scale(0.7)" fill="#FFD200"/>
<use id="level-7" xlink:href="#level" transform="scale(0.7)" fill="#FFB000"/>
<use id="level-8" xlink:href="#level" transform="scale(0.7)" fill="#FF7A00"/>
<use id="level-9" xlink:href="#level" transform="scale(0.7)" fill="#E53900"/>
<use id="level-10" xlink:href="#level" transform="scale(0.7)" fill="#B00020"/>

easy attributes fill="white" fill-opacity=".25"
rough attributes fill="black" fill-opacity="0"
dangerous attributes fill="black" fill-opacity=".10"

# barriers for hex maps
<path id="barrier1" transform="rotate( 60)" d="M-90,-17.3 l-8.7,-5 M-80,-34.6 l-8.7,-5 M-70,-52 l-8.7,-5 M-60,-69.3 l-8.7,-5" stroke="black" stroke-width="5px" fill="none"/>
<path id="barrier2" transform="rotate(120)" d="M-90,-17.3 l-8.7,-5 M-80,-34.6 l-8.7,-5 M-70,-52 l-8.7,-5 M-60,-69.3 l-8.7,-5" stroke="black" stroke-width="5px" fill="none"/>
<path id="barrier3" transform="rotate(180)" d="M-90,-17.3 l-8.7,-5 M-80,-34.6 l-8.7,-5 M-70,-52 l-8.7,-5 M-60,-69.3 l-8.7,-5" stroke="black" stroke-width="5px" fill="none"/>
<path id="barrier4" transform="rotate(240)" d="M-90,-17.3 l-8.7,-5 M-80,-34.6 l-8.7,-5 M-70,-52 l-8.7,-5 M-60,-69.3 l-8.7,-5" stroke="black" stroke-width="5px" fill="none"/>
<path id="barrier5" transform="rotate(300)" d="M-90,-17.3 l-8.7,-5 M-80,-34.6 l-8.7,-5 M-70,-52 l-8.7,-5 M-60,-69.3 l-8.7,-5" stroke="black" stroke-width="5px" fill="none"/>
<path id="barrier6" transform="rotate(  0)" d="M-90,-17.3 l-8.7,-5 M-80,-34.6 l-8.7,-5 M-70,-52 l-8.7,-5 M-60,-69.3 l-8.7,-5" stroke="black" stroke-width="5px" fill="none"/>
# barriers for square maps
<path id="barriers0" transform="rotate(  0)" d="M-94,70 V-70" stroke-dasharray="5 17" stroke="black" stroke-width="12px" fill="none"/>
<path id="barriers1" transform="rotate( 90)" d="M-94,70 V-70" stroke-dasharray="5 17" stroke="black" stroke-width="12px" fill="none"/>
<path id="barriers2" transform="rotate(180)" d="M-94,70 V-70" stroke-dasharray="5 17" stroke="black" stroke-width="12px" fill="none"/>
<path id="barriers3" transform="rotate(270)" d="M-94,70 V-70" stroke-dasharray="5 17" stroke="black" stroke-width="12px" fill="none"/>
`;

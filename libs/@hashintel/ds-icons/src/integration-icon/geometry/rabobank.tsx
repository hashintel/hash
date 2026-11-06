/* Brand names and artwork remain trademarks of their respective owners. Bounds and theme colors adjusted; app tiles composed. */
export const markLight = ({ id }: { id: string }) => (
  <g x="0px" y="0px" fill="#111111">
    <defs>
      <clipPath id={`${id}-brand-symbol-bounds`}>
        <rect x="0.0" y="0.0" width="206.98" height="200.0" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-brand-symbol-bounds)`}>
      <path
        fill="#2C3696"
        d="M122.39,236.24c-0.89,5.6-3.76,8.52-7.23,8.52c-2.21,0-3.47-1.55-3.1-3.93l1.21-7.58  c0.46-2.81,2.15-5.02,5.17-5.02C121.79,228.23,123.31,230.5,122.39,236.24 M110.54,247.38c0.46,0,1.58,1.95,5.25,1.95  c7.78,0,12.23-5.62,13.43-12.89c1.55-8.95-2.81-13.03-8.29-13.03c-2.58,0-4.51,0.23-5.91,0.98l2.1-12.31h-6.46l-6.43,36.79h4.88  c0,0,0.69-1.52,1.46-1.52h-0.03V247.38z M179.24,231.71c0.98-5.57-1.09-8.29-7.12-8.29c-4.51,0-6.26,1.98-7.95,3.67l0.17-3.1  l-5.97,0.03l-0.46,4.59l-3.47,20.32h6.54l2.1-13.17c0.75-4.53,3.87-8.01,6.83-8.01c3.27,0,3.24,1.87,2.73,4.74l-2.84,16.47h6.49  L179.24,231.71z M206.57,223.47h-7.63l-8.78,9.3l-0.11-0.03l3.5-20.61h-6.37l-6.43,36.76h6.46l0.66-3.67l1.32-8.06  c3.42,0,5.34,0.37,6.83,7.18l1.03,4.56h6.6c0,0-1.64-6.95-2.73-9.67c-1.12-2.87-2.35-4.74-4.97-5.25L206.57,223.47z M18.9,232.48  c4.74-1.03,7.18-4.85,7.84-7.35c1.69-6.83-1.35-12.17-10.07-12.08H6.67l-6.26,35.87h6.51l2.58-14.41c6-0.17,6.74,1.29,7.86,8.29  l1.03,6.11h6.74c-0.8-3.7-1.32-7.2-1.98-10.02c-0.69-2.96-1.81-5.25-4.62-6.34L18.9,232.48z M20.22,223.93  c-0.57,3.19-3.04,5.42-6.08,5.42h-3.85l1.98-11.34l3.5-0.03C19.9,218.02,20.7,220.74,20.22,223.93 M49.63,230.73  c0.95-5.42-1.98-7.32-7.84-7.32c-7.32,0-10.5,3.47-10.5,3.47l2.24,3.79c0,0,2.35-2.76,7.09-2.76c2.64,0,2.7,1.32,2.44,2.76  l-0.52,3.24c-9.41-0.23-14.24,1.78-15.33,7.95c-0.89,5.05,2.9,7.49,7.18,7.49c2.21,0,3.99-0.32,6.14-2.21  c0.43,1.21,1.18,1.87,2.01,2.01c1.35,0.29,3.7-0.03,4.39-0.55c-0.06-0.75,0-2.67,0.8-7.18L49.63,230.73z M41.91,237.33  c-1.03,7.4-2.04,8.15-5.6,8.15c-2.44,0-3.33-1.66-2.93-3.85C33.96,238.62,36.2,237.33,41.91,237.33 M152.9,230.73  c0.95-5.42-1.98-7.32-7.84-7.32c-7.32,0-10.48,3.47-10.48,3.47l2.24,3.79c0,0,2.35-2.76,7.09-2.76c2.64,0,2.7,1.32,2.44,2.76  l-0.52,3.24c-9.41-0.23-14.24,1.78-15.33,7.95c-0.89,5.05,2.9,7.49,7.18,7.49c2.21,0,3.99-0.32,6.14-2.21  c0.43,1.21,1.18,1.87,2.01,2.01c1.35,0.29,3.7-0.03,4.39-0.55c-0.06-0.75,0-2.67,0.8-7.18L152.9,230.73z M145.18,237.33  c-1.03,7.4-2.04,8.15-5.6,8.15c-2.44,0-3.33-1.66-2.93-3.85C137.23,238.62,139.47,237.33,145.18,237.33 M62.69,249.36  c7.78,0,12.23-5.63,13.43-12.89c1.55-8.95-2.81-13.03-8.29-13.03c-2.58,0-4.42,0.23-5.88,0.98l2.1-12.31h-6.49l-6.43,36.79h4.88  c0,0,0.69-1.52,1.41-1.52C57.93,247.38,59.05,249.36,62.69,249.36 M65.42,228.23c3.33,0,4.74,2.24,3.96,8.01  c-0.8,5.88-3.76,8.52-7.29,8.52c-2.21,0-3.47-1.55-3.04-3.93l1.23-7.58c0.46-2.81,2.15-5.02,5.11-5.02H65.42z M78.88,238.48  c1-9.36,5.22-15.15,15.27-15.15c7.46,0,9.9,5.68,8.93,11.8c-1.61,9.79-5.4,14.38-14.95,14.38C81.89,249.5,78.22,244.45,78.88,238.48   M96.24,235.58c0.49-2.58,0.98-7.61-3.47-7.61c-2.98,0-5.8,2.04-7.06,9.16c-0.77,4.33,0.06,7.84,3.53,7.84  C91.82,244.94,94.89,242.84,96.24,235.58"
      />
      <linearGradient
        id={`${id}-SVGID_1_`}
        gradientUnits="userSpaceOnUse"
        x1="-558.2126"
        y1="254.0371"
        x2="-555.7452"
        y2="254.0371"
        gradientTransform="matrix(73.2704 0 0 -73.2704 40935.2188 18762.3984)"
      >
        <stop offset="0" stopColor="#C95222" />
        <stop offset="2.170000e-03" stopColor="#C95222" />
        <stop offset="6.060000e-03" stopColor="#C95222" />
        <stop offset="9.950000e-03" stopColor="#C85222" />
        <stop offset="0.0138" stopColor="#C85222" />
        <stop offset="0.0177" stopColor="#C85122" />
        <stop offset="0.0216" stopColor="#C75122" />
        <stop offset="0.0255" stopColor="#C75122" />
        <stop offset="0.0294" stopColor="#C65122" />
        <stop offset="0.0333" stopColor="#C65123" />
        <stop offset="0.0372" stopColor="#C65123" />
        <stop offset="0.0411" stopColor="#C55123" />
        <stop offset="0.045" stopColor="#C55023" />
        <stop offset="0.0489" stopColor="#C55023" />
        <stop offset="0.0527" stopColor="#C45023" />
        <stop offset="0.0566" stopColor="#C45023" />
        <stop offset="0.0605" stopColor="#C45023" />
        <stop offset="0.0644" stopColor="#C35023" />
        <stop offset="0.0683" stopColor="#C35023" />
        <stop offset="0.0722" stopColor="#C34F23" />
        <stop offset="0.0761" stopColor="#C24F23" />
        <stop offset="0.08" stopColor="#C24F23" />
        <stop offset="0.0838" stopColor="#C14F23" />
        <stop offset="0.0877" stopColor="#C14F23" />
        <stop offset="0.0916" stopColor="#C14F24" />
        <stop offset="0.0955" stopColor="#C04F24" />
        <stop offset="0.0994" stopColor="#C04E24" />
        <stop offset="0.1033" stopColor="#C04E24" />
        <stop offset="0.1072" stopColor="#BF4E24" />
        <stop offset="0.1111" stopColor="#BF4E24" />
        <stop offset="0.115" stopColor="#BF4E24" />
        <stop offset="0.1189" stopColor="#BE4E24" />
        <stop offset="0.1227" stopColor="#BE4E24" />
        <stop offset="0.1266" stopColor="#BE4E24" />
        <stop offset="0.1305" stopColor="#BD4D24" />
        <stop offset="0.1344" stopColor="#BD4D24" />
        <stop offset="0.1383" stopColor="#BC4D24" />
        <stop offset="0.1422" stopColor="#BC4D24" />
        <stop offset="0.1461" stopColor="#BC4D24" />
        <stop offset="0.15" stopColor="#BB4D25" />
        <stop offset="0.1539" stopColor="#BB4D25" />
        <stop offset="0.1577" stopColor="#BB4C25" />
        <stop offset="0.1616" stopColor="#BA4C25" />
        <stop offset="0.1655" stopColor="#BA4C25" />
        <stop offset="0.1694" stopColor="#BA4C25" />
        <stop offset="0.1733" stopColor="#B94C25" />
        <stop offset="0.1772" stopColor="#B94C25" />
        <stop offset="0.1811" stopColor="#B84C25" />
        <stop offset="0.185" stopColor="#B84B25" />
        <stop offset="0.1889" stopColor="#B84B25" />
        <stop offset="0.1928" stopColor="#B74B25" />
        <stop offset="0.1966" stopColor="#B74B25" />
        <stop offset="0.2005" stopColor="#B74B25" />
        <stop offset="0.2044" stopColor="#B64B25" />
        <stop offset="0.2083" stopColor="#B64B26" />
        <stop offset="0.2122" stopColor="#B64A26" />
        <stop offset="0.2161" stopColor="#B54A26" />
        <stop offset="0.22" stopColor="#B54A26" />
        <stop offset="0.2239" stopColor="#B54A26" />
        <stop offset="0.2278" stopColor="#B44A26" />
        <stop offset="0.2316" stopColor="#B44A26" />
        <stop offset="0.2355" stopColor="#B34A26" />
        <stop offset="0.2394" stopColor="#B34926" />
        <stop offset="0.2433" stopColor="#B34926" />
        <stop offset="0.2472" stopColor="#B24926" />
        <stop offset="0.2511" stopColor="#B24926" />
        <stop offset="0.255" stopColor="#B24926" />
        <stop offset="0.2589" stopColor="#B14926" />
        <stop offset="0.2628" stopColor="#B14926" />
        <stop offset="0.2666" stopColor="#B14827" />
        <stop offset="0.2705" stopColor="#B04827" />
        <stop offset="0.2744" stopColor="#B04827" />
        <stop offset="0.2783" stopColor="#AF4827" />
        <stop offset="0.2822" stopColor="#AF4827" />
        <stop offset="0.2861" stopColor="#AF4827" />
        <stop offset="0.29" stopColor="#AE4827" />
        <stop offset="0.2939" stopColor="#AE4727" />
        <stop offset="0.2978" stopColor="#AE4727" />
        <stop offset="0.3016" stopColor="#AD4727" />
        <stop offset="0.3055" stopColor="#AD4727" />
        <stop offset="0.3094" stopColor="#AD4727" />
        <stop offset="0.3133" stopColor="#AC4727" />
        <stop offset="0.3172" stopColor="#AC4727" />
        <stop offset="0.3211" stopColor="#AC4627" />
        <stop offset="0.325" stopColor="#AB4628" />
        <stop offset="0.3289" stopColor="#AB4628" />
        <stop offset="0.3328" stopColor="#AA4628" />
        <stop offset="0.3367" stopColor="#AA4628" />
        <stop offset="0.3405" stopColor="#AA4628" />
        <stop offset="0.3444" stopColor="#A94628" />
        <stop offset="0.3483" stopColor="#A94528" />
        <stop offset="0.3522" stopColor="#A94528" />
        <stop offset="0.3561" stopColor="#A84528" />
        <stop offset="0.36" stopColor="#A84528" />
        <stop offset="0.3639" stopColor="#A84528" />
        <stop offset="0.3678" stopColor="#A74528" />
        <stop offset="0.3717" stopColor="#A74528" />
        <stop offset="0.3755" stopColor="#A74528" />
        <stop offset="0.3794" stopColor="#A64428" />
        <stop offset="0.3833" stopColor="#A64429" />
        <stop offset="0.3872" stopColor="#A54429" />
        <stop offset="0.3911" stopColor="#A54429" />
        <stop offset="0.395" stopColor="#A54429" />
        <stop offset="0.3989" stopColor="#A44429" />
        <stop offset="0.4028" stopColor="#A44429" />
        <stop offset="0.4067" stopColor="#A44329" />
        <stop offset="0.4105" stopColor="#A34329" />
        <stop offset="0.4144" stopColor="#A34329" />
        <stop offset="0.4183" stopColor="#A34329" />
        <stop offset="0.4222" stopColor="#A24329" />
        <stop offset="0.4261" stopColor="#A24329" />
        <stop offset="0.43" stopColor="#A14329" />
        <stop offset="0.4339" stopColor="#A14229" />
        <stop offset="0.4378" stopColor="#A14229" />
        <stop offset="0.4417" stopColor="#A0422A" />
        <stop offset="0.4455" stopColor="#A0422A" />
        <stop offset="0.4494" stopColor="#A0422A" />
        <stop offset="0.4533" stopColor="#9F422A" />
        <stop offset="0.4572" stopColor="#9F422A" />
        <stop offset="0.4611" stopColor="#9F412A" />
        <stop offset="0.465" stopColor="#9E412A" />
        <stop offset="0.4689" stopColor="#9E412A" />
        <stop offset="0.4728" stopColor="#9E412A" />
        <stop offset="0.4767" stopColor="#9D412A" />
        <stop offset="0.4805" stopColor="#9D412A" />
        <stop offset="0.4844" stopColor="#9C412A" />
        <stop offset="0.4883" stopColor="#9C402A" />
        <stop offset="0.4922" stopColor="#9C402A" />
        <stop offset="0.4961" stopColor="#9B402A" />
        <stop offset="0.5" stopColor="#9B402A" />
        <stop offset="0.5039" stopColor="#9B402B" />
        <stop offset="0.5078" stopColor="#9A402B" />
        <stop offset="0.5117" stopColor="#9A402B" />
        <stop offset="0.5156" stopColor="#9A3F2B" />
        <stop offset="0.5195" stopColor="#993F2B" />
        <stop offset="0.5233" stopColor="#993F2B" />
        <stop offset="0.5272" stopColor="#983F2B" />
        <stop offset="0.5311" stopColor="#983F2B" />
        <stop offset="0.535" stopColor="#983F2B" />
        <stop offset="0.5389" stopColor="#973F2B" />
        <stop offset="0.5428" stopColor="#973E2B" />
        <stop offset="0.5467" stopColor="#973E2B" />
        <stop offset="0.5506" stopColor="#963E2B" />
        <stop offset="0.5544" stopColor="#963E2B" />
        <stop offset="0.5583" stopColor="#963E2B" />
        <stop offset="0.5622" stopColor="#953E2C" />
        <stop offset="0.5661" stopColor="#953E2C" />
        <stop offset="0.57" stopColor="#953D2C" />
        <stop offset="0.5739" stopColor="#943D2C" />
        <stop offset="0.5778" stopColor="#943D2C" />
        <stop offset="0.5817" stopColor="#933D2C" />
        <stop offset="0.5856" stopColor="#933D2C" />
        <stop offset="0.5895" stopColor="#933D2C" />
        <stop offset="0.5933" stopColor="#923D2C" />
        <stop offset="0.5972" stopColor="#923C2C" />
        <stop offset="0.6011" stopColor="#923C2C" />
        <stop offset="0.605" stopColor="#913C2C" />
        <stop offset="0.6089" stopColor="#913C2C" />
        <stop offset="0.6128" stopColor="#913C2C" />
        <stop offset="0.6167" stopColor="#903C2C" />
        <stop offset="0.6206" stopColor="#903C2D" />
        <stop offset="0.6245" stopColor="#903B2D" />
        <stop offset="0.6284" stopColor="#8F3B2D" />
        <stop offset="0.6322" stopColor="#8F3B2D" />
        <stop offset="0.6361" stopColor="#8E3B2D" />
        <stop offset="0.64" stopColor="#8E3B2D" />
        <stop offset="0.6439" stopColor="#8E3B2D" />
        <stop offset="0.6478" stopColor="#8D3B2D" />
        <stop offset="0.6517" stopColor="#8D3B2D" />
        <stop offset="0.6556" stopColor="#8D3A2D" />
        <stop offset="0.6595" stopColor="#8C3A2D" />
        <stop offset="0.6633" stopColor="#8C3A2D" />
        <stop offset="0.6672" stopColor="#8C3A2D" />
        <stop offset="0.6711" stopColor="#8B3A2D" />
        <stop offset="0.675" stopColor="#8B3A2D" />
        <stop offset="0.6789" stopColor="#8A3A2E" />
        <stop offset="0.6828" stopColor="#8A392E" />
        <stop offset="0.6867" stopColor="#8A392E" />
        <stop offset="0.6906" stopColor="#89392E" />
        <stop offset="0.6945" stopColor="#89392E" />
        <stop offset="0.6984" stopColor="#89392E" />
        <stop offset="0.7022" stopColor="#88392E" />
        <stop offset="0.7061" stopColor="#88392E" />
        <stop offset="0.71" stopColor="#88382E" />
        <stop offset="0.7139" stopColor="#87382E" />
        <stop offset="0.7178" stopColor="#87382E" />
        <stop offset="0.7217" stopColor="#87382E" />
        <stop offset="0.7256" stopColor="#86382E" />
        <stop offset="0.7295" stopColor="#86382E" />
        <stop offset="0.7334" stopColor="#85382E" />
        <stop offset="0.7372" stopColor="#85372F" />
        <stop offset="0.7411" stopColor="#85372F" />
        <stop offset="0.745" stopColor="#84372F" />
        <stop offset="0.7489" stopColor="#84372F" />
        <stop offset="0.7528" stopColor="#84372F" />
        <stop offset="0.7567" stopColor="#83372F" />
        <stop offset="0.7606" stopColor="#83372F" />
        <stop offset="0.7645" stopColor="#83362F" />
        <stop offset="0.7684" stopColor="#82362F" />
        <stop offset="0.7722" stopColor="#82362F" />
        <stop offset="0.7761" stopColor="#81362F" />
        <stop offset="0.78" stopColor="#81362F" />
        <stop offset="0.7839" stopColor="#81362F" />
        <stop offset="0.7878" stopColor="#80362F" />
        <stop offset="0.7917" stopColor="#80352F" />
        <stop offset="0.7956" stopColor="#803530" />
        <stop offset="0.7995" stopColor="#7F3530" />
        <stop offset="0.8034" stopColor="#7F3530" />
        <stop offset="0.8073" stopColor="#7F3530" />
        <stop offset="0.8111" stopColor="#7E3530" />
        <stop offset="0.815" stopColor="#7E3530" />
        <stop offset="0.8189" stopColor="#7E3430" />
        <stop offset="0.8228" stopColor="#7D3430" />
        <stop offset="0.8267" stopColor="#7D3430" />
        <stop offset="0.8306" stopColor="#7C3430" />
        <stop offset="0.8345" stopColor="#7C3430" />
        <stop offset="0.8384" stopColor="#7C3430" />
        <stop offset="0.8422" stopColor="#7B3430" />
        <stop offset="0.8461" stopColor="#7B3330" />
        <stop offset="0.85" stopColor="#7B3330" />
        <stop offset="0.8539" stopColor="#7A3331" />
        <stop offset="0.8578" stopColor="#7A3331" />
        <stop offset="0.8617" stopColor="#7A3331" />
        <stop offset="0.8656" stopColor="#793331" />
        <stop offset="0.8695" stopColor="#793331" />
        <stop offset="0.8734" stopColor="#783231" />
        <stop offset="0.8773" stopColor="#783231" />
        <stop offset="0.8812" stopColor="#783231" />
        <stop offset="0.885" stopColor="#773231" />
        <stop offset="0.8889" stopColor="#773231" />
        <stop offset="0.8928" stopColor="#773231" />
        <stop offset="0.8967" stopColor="#763231" />
        <stop offset="0.9006" stopColor="#763231" />
        <stop offset="0.9045" stopColor="#763131" />
        <stop offset="0.9084" stopColor="#753131" />
        <stop offset="0.9123" stopColor="#753132" />
        <stop offset="0.9161" stopColor="#753132" />
        <stop offset="0.92" stopColor="#743132" />
        <stop offset="0.9239" stopColor="#743132" />
        <stop offset="0.9278" stopColor="#733132" />
        <stop offset="0.9317" stopColor="#733032" />
        <stop offset="0.9356" stopColor="#733032" />
        <stop offset="0.9395" stopColor="#723032" />
        <stop offset="0.9434" stopColor="#723032" />
        <stop offset="0.9473" stopColor="#723032" />
        <stop offset="0.9512" stopColor="#713032" />
        <stop offset="0.955" stopColor="#713032" />
        <stop offset="0.9589" stopColor="#712F32" />
        <stop offset="0.9628" stopColor="#702F32" />
        <stop offset="0.9667" stopColor="#702F32" />
        <stop offset="0.9706" stopColor="#702F33" />
        <stop offset="0.9745" stopColor="#6F2F33" />
        <stop offset="0.9784" stopColor="#6F2F33" />
        <stop offset="0.9823" stopColor="#6E2F33" />
        <stop offset="0.9862" stopColor="#6E2E33" />
        <stop offset="1" stopColor="#6D2E33" />
      </linearGradient>
      <path
        fill={`url(#${id}-SVGID_1_)`}
        d="M37.55,126.98c-5.14,10.27-3.5,24.97,7.35,35.61c12.34,12.11,31.63,19.4,57.89,19.4  c26.35,0,45.63-7.52,57.43-19.4c11.59-11.65,12.02-26.81,7.29-35.96c-1.92-3.7-4.51-7.12-8.04-10.36c2.64,2.69,4.79,5.63,6.38,8.72  c0.06,0.11,0.11,0.26,0.17,0.37c0.23,0.46,0.46,0.95,0.66,1.43c0.98,2.27,1.63,4.59,1.95,6.95c0.72,5.22-0.23,10.36-2.9,15.41  c-1.64,3.07-3.9,6.11-6.86,9.01c-12.02,11.79-32.52,19.06-56.28,19.06c-22.33,0-41.73-6.4-53.99-16.93l0,0  c-0.8-0.69-1.58-1.41-2.3-2.12c-10.5-10.31-12.43-22.1-7.18-32.81c0.11-0.23,0.23-0.46,0.34-0.69c1.61-3.04,3.76-5.91,6.34-8.55  c0.03-0.03,0.08-0.08,0.11-0.12C42.61,119.28,39.96,122.15,37.55,126.98"
      />
      <path
        fill="#F36717"
        d="M139.89,103.64c-11.14-4.62-24.11-7-37.28-7c-13.17,0-26.15,2.38-37.28,7  c-12.2,5.05-21.64,12.57-26.15,21.73c-5.25,10.7-3.33,22.5,7.18,32.8c12.03,11.8,32.52,19.06,56.28,19.06  c23.76,0,44.26-7.26,56.28-19.06c10.5-10.3,12.43-22.1,7.15-32.8C161.5,116.21,152.09,108.7,139.89,103.64"
      />
      <linearGradient
        id={`${id}-SVGID_2_`}
        gradientUnits="userSpaceOnUse"
        x1="-555.066"
        y1="256.1931"
        x2="-552.5981"
        y2="256.1931"
        gradientTransform="matrix(45.2844 -7.9848 -7.9848 -45.2844 27205.0078 7306.6411)"
      >
        <stop offset="0" stopColor="#FDDB63" />
        <stop offset="3.460000e-03" stopColor="#FDDB63" />
        <stop offset="0.0112" stopColor="#FDDA62" />
        <stop offset="0.019" stopColor="#FDD962" />
        <stop offset="0.0267" stopColor="#FDD861" />
        <stop offset="0.0345" stopColor="#FDD761" />
        <stop offset="0.0422" stopColor="#FDD660" />
        <stop offset="0.05" stopColor="#FDD65F" />
        <stop offset="0.0578" stopColor="#FCD55F" />
        <stop offset="0.0655" stopColor="#FCD45E" />
        <stop offset="0.0733" stopColor="#FCD35E" />
        <stop offset="0.081" stopColor="#FCD25D" />
        <stop offset="0.0888" stopColor="#FCD15C" />
        <stop offset="0.0966" stopColor="#FCD05C" />
        <stop offset="0.1043" stopColor="#FCCF5B" />
        <stop offset="0.1121" stopColor="#FCCE5B" />
        <stop offset="0.1198" stopColor="#FCCD5A" />
        <stop offset="0.1276" stopColor="#FCCC5A" />
        <stop offset="0.1354" stopColor="#FCCC59" />
        <stop offset="0.1431" stopColor="#FCCB58" />
        <stop offset="0.1509" stopColor="#FCCA58" />
        <stop offset="0.1586" stopColor="#FBC957" />
        <stop offset="0.1664" stopColor="#FBC857" />
        <stop offset="0.1741" stopColor="#FBC756" />
        <stop offset="0.1819" stopColor="#FBC655" />
        <stop offset="0.1897" stopColor="#FBC555" />
        <stop offset="0.1974" stopColor="#FBC454" />
        <stop offset="0.2052" stopColor="#FBC354" />
        <stop offset="0.2129" stopColor="#FBC353" />
        <stop offset="0.2207" stopColor="#FBC252" />
        <stop offset="0.2285" stopColor="#FBC152" />
        <stop offset="0.2362" stopColor="#FBC051" />
        <stop offset="0.244" stopColor="#FBBF51" />
        <stop offset="0.2517" stopColor="#FBBE50" />
        <stop offset="0.2595" stopColor="#FABD4F" />
        <stop offset="0.2672" stopColor="#FABC4F" />
        <stop offset="0.275" stopColor="#FABB4E" />
        <stop offset="0.2828" stopColor="#FABA4E" />
        <stop offset="0.2905" stopColor="#FAB94D" />
        <stop offset="0.2983" stopColor="#FAB94C" />
        <stop offset="0.306" stopColor="#FAB84C" />
        <stop offset="0.3138" stopColor="#FAB74B" />
        <stop offset="0.3216" stopColor="#FAB64B" />
        <stop offset="0.3293" stopColor="#FAB54A" />
        <stop offset="0.3371" stopColor="#FAB449" />
        <stop offset="0.3448" stopColor="#FAB349" />
        <stop offset="0.3526" stopColor="#F9B248" />
        <stop offset="0.3604" stopColor="#F9B148" />
        <stop offset="0.3681" stopColor="#F9B047" />
        <stop offset="0.3759" stopColor="#F9AF47" />
        <stop offset="0.3836" stopColor="#F9AF46" />
        <stop offset="0.3914" stopColor="#F9AE45" />
        <stop offset="0.3991" stopColor="#F9AD45" />
        <stop offset="0.4069" stopColor="#F9AC44" />
        <stop offset="0.4147" stopColor="#F9AB44" />
        <stop offset="0.4224" stopColor="#F9AA43" />
        <stop offset="0.4302" stopColor="#F9A942" />
        <stop offset="0.4379" stopColor="#F9A842" />
        <stop offset="0.4457" stopColor="#F9A741" />
        <stop offset="0.4535" stopColor="#F8A641" />
        <stop offset="0.4612" stopColor="#F8A640" />
        <stop offset="0.469" stopColor="#F8A53F" />
        <stop offset="0.4767" stopColor="#F8A43F" />
        <stop offset="0.4845" stopColor="#F8A33E" />
        <stop offset="0.4922" stopColor="#F8A23E" />
        <stop offset="0.5" stopColor="#F8A13D" />
        <stop offset="0.5078" stopColor="#F8A03C" />
        <stop offset="0.5155" stopColor="#F89F3C" />
        <stop offset="0.5233" stopColor="#F89E3B" />
        <stop offset="0.531" stopColor="#F89D3B" />
        <stop offset="0.5388" stopColor="#F89C3A" />
        <stop offset="0.5465" stopColor="#F89C39" />
        <stop offset="0.5543" stopColor="#F79B39" />
        <stop offset="0.5621" stopColor="#F79A38" />
        <stop offset="0.5698" stopColor="#F79938" />
        <stop offset="0.5776" stopColor="#F79837" />
        <stop offset="0.5853" stopColor="#F79736" />
        <stop offset="0.5931" stopColor="#F79636" />
        <stop offset="0.6009" stopColor="#F79535" />
        <stop offset="0.6086" stopColor="#F79435" />
        <stop offset="0.6164" stopColor="#F79334" />
        <stop offset="0.6241" stopColor="#F79234" />
        <stop offset="0.6319" stopColor="#F79233" />
        <stop offset="0.6396" stopColor="#F79132" />
        <stop offset="0.6474" stopColor="#F79032" />
        <stop offset="0.6552" stopColor="#F68F31" />
        <stop offset="0.6629" stopColor="#F68E31" />
        <stop offset="0.6707" stopColor="#F68D30" />
        <stop offset="0.6784" stopColor="#F68C2F" />
        <stop offset="0.6862" stopColor="#F68B2F" />
        <stop offset="0.694" stopColor="#F68A2E" />
        <stop offset="0.7017" stopColor="#F6892E" />
        <stop offset="0.7095" stopColor="#F6892D" />
        <stop offset="0.7172" stopColor="#F6882C" />
        <stop offset="0.725" stopColor="#F6872C" />
        <stop offset="0.7328" stopColor="#F6862B" />
        <stop offset="0.7405" stopColor="#F6852B" />
        <stop offset="0.7483" stopColor="#F5842A" />
        <stop offset="0.756" stopColor="#F58329" />
        <stop offset="0.7638" stopColor="#F58229" />
        <stop offset="0.7715" stopColor="#F58128" />
        <stop offset="0.7793" stopColor="#F58028" />
        <stop offset="0.7871" stopColor="#F57F27" />
        <stop offset="0.7948" stopColor="#F57F26" />
        <stop offset="0.8026" stopColor="#F57E26" />
        <stop offset="0.8103" stopColor="#F57D25" />
        <stop offset="0.8181" stopColor="#F57C25" />
        <stop offset="0.8259" stopColor="#F57B24" />
        <stop offset="0.8336" stopColor="#F57A23" />
        <stop offset="0.8414" stopColor="#F57923" />
        <stop offset="0.8491" stopColor="#F47822" />
        <stop offset="0.8569" stopColor="#F47722" />
        <stop offset="0.8647" stopColor="#F47621" />
        <stop offset="0.8724" stopColor="#F47521" />
        <stop offset="0.8802" stopColor="#F47520" />
        <stop offset="0.8879" stopColor="#F4741F" />
        <stop offset="0.8957" stopColor="#F4731F" />
        <stop offset="0.9034" stopColor="#F4721E" />
        <stop offset="0.9112" stopColor="#F4711E" />
        <stop offset="0.919" stopColor="#F4701D" />
        <stop offset="0.9267" stopColor="#F46F1C" />
        <stop offset="0.9345" stopColor="#F46E1C" />
        <stop offset="0.9422" stopColor="#F46D1B" />
        <stop offset="0.95" stopColor="#F36C1B" />
        <stop offset="0.9578" stopColor="#F36C1A" />
        <stop offset="0.9655" stopColor="#F36B19" />
        <stop offset="0.9733" stopColor="#F36A19" />
        <stop offset="0.981" stopColor="#F36918" />
        <stop offset="0.9888" stopColor="#F36818" />
        <stop offset="0.9965" stopColor="#F36717" />
        <stop offset="1" stopColor="#F36717" />
      </linearGradient>
      <path
        fill={`url(#${id}-SVGID_2_)`}
        d="M104.91,126.69c0,0-1.06,0.29-2.24,0.6c0.08,2.76,0.17,5.57,0.26,8.38c1.86-2.9,3.18-5.91,3.96-9.01  c-0.26-0.03-0.55-0.03-0.8-0.03C105.69,126.63,105.28,126.66,104.91,126.69 M102.59,124.91c0,0.34,0.03,0.69,0.03,1.03  c0.32-0.46,0.63-0.86,0.95-1.24c-0.11-0.06-0.23-0.11-0.34-0.17C103.02,124.68,102.82,124.79,102.59,124.91 M102.59,124.19  c-12.46,0.2-22.3,0.78-34.55,1.81c10.76,0.03,19.11,0.43,30.05,1.29c-7.78,4.79-15.38,9.9-22.79,15.24  c7.69-4.34,15.53-8.44,23.48-12.26c-0.2-0.89-0.4-1.78-0.6-2.67l-0.06-0.32c1.49-0.92,3.01-1.84,4.5-2.76  C102.59,124.42,102.59,124.31,102.59,124.19C102.59,124.16,102.59,124.16,102.59,124.19C102.59,124.16,102.59,124.16,102.59,124.19   M102.59,124.19c0.11,0.06,0.2,0.11,0.31,0.18c-0.11,0.06-0.23,0.14-0.31,0.2c0.06-0.03,0.08-0.06,0.14-0.09l0.2-0.11  c0.11-0.06,0.23-0.15,0.34-0.2C103.02,124.16,102.82,124.16,102.59,124.19 M103.25,124.16L103.25,124.16 M103.25,124.16  c0.29,0,0.55,0,0.83,0c0.34-0.37,0.69-0.75,1.09-1.12C104.51,123.42,103.88,123.79,103.25,124.16 M107.53,118.68  c0,0.03,0.03,0.08,0.03,0.11C107.55,118.77,107.55,118.71,107.53,118.68L107.53,118.68 M93.49,121.78c1.55-0.17,3.13-0.34,4.68-0.49  c-6.28-3.5-12.71-6.77-19.29-9.67C83.91,114.78,88.75,118.19,93.49,121.78 M98.17,121.29c1.66,0.92,3.33,1.86,4.99,2.84  c0.03,0.03,0.06,0.03,0.08,0.06c0-6.14,0-12.28,0-18.46C101.38,110.85,99.72,116.07,98.17,121.29 M103.16,102.61L103.16,102.61  c-16.88,0-43.88,5.77-48.13,25.23c-0.72,3.27-0.66,6.26,0,8.98c2.41,8.61,10.99,14.52,20.78,18.25  c10.31-3.64,18.34-8.92,23.76-15.04c-0.54-2.44-1.09-4.88-1.66-7.35c-9.99,4.71-19.06,9.21-28.96,14.46  c7-6.95,13.63-12.94,21.15-19.31c-10.68-0.69-20.89-0.83-31.8-0.98c10.7-2.33,21.3-4.13,32.17-5.51  c-5.11-4.02-10.11-7.75-15.59-11.25l0,0l-0.83-0.52c8.24,2.09,16.05,4.59,24.02,7.52c1.58-4.71,3.24-9.39,5.14-13.98  C103.19,102.95,103.19,102.78,103.16,102.61z M65.31,103.64c-11.88,4.94-21.15,12.17-25.8,21.04c-0.11,0.23-0.23,0.46-0.34,0.69  c-5.28,10.7-3.33,22.5,7.18,32.8c0.75,0.72,1.49,1.44,2.3,2.12c8.9-0.52,16.96-1.98,24.02-4.16c-9.44-4.02-17.42-10.1-19.49-18.74  c-0.83-3.01-0.95-6.37-0.11-10.05c4.5-20.12,32.43-26.12,49.94-26.12c0.03,0,0.08,0,0.11,0c0-1.61,0.17-3.16,0.37-4.59  c-0.31,0-0.6,0-0.92,0C89.42,96.64,76.44,99.02,65.31,103.64"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#FFFFFF"
        d="M74.07,109.56c8.24,2.09,16.04,4.59,24.02,7.52  c1.58-4.74,3.24-9.44,5.17-14.03c1.92,4.62,3.59,9.3,5.17,14.03c7.95-2.93,15.64-5.34,23.88-7.4c-5.8,3.64-10.91,7.38-16.27,11.59  c10.88,1.38,21.07,3.19,31.77,5.51c-10.68-0.23-20.75,0.14-31.4,0.83c7.52,6.37,13.95,12.54,20.95,19.49  c-9.59-5.48-18.57-10.07-28.56-14.78c-1.92,8.35-3.76,16.73-5.54,25.11c-1.75-8.38-3.39-16.36-5.31-24.71  c-9.99,4.71-19.06,9.21-28.96,14.46c7-6.95,13.63-12.94,21.15-19.31c-10.68-0.69-20.89-0.83-31.8-0.98  c10.71-2.32,21.3-4.13,32.17-5.51C85.12,117.11,79.84,113.21,74.07,109.56 M103.26,124.17c0-6.14,0-12.28,0-18.45  c-1.87,5.14-3.53,10.33-5.08,15.56C99.88,122.22,101.57,123.2,103.26,124.17 M78.87,111.6c6.6,2.9,13,6.17,19.29,9.67  c-1.55,0.14-3.13,0.32-4.68,0.49C88.74,118.2,83.89,114.79,78.87,111.6 M103.26,124.17c12.71,0.03,25.4,0.66,38.03,1.92  c-11.11-2.01-21.87-3.53-32.98-4.82C106.59,122.22,104.93,123.17,103.26,124.17 M127.6,111.6c-6.6,2.9-13.03,6.17-19.31,9.67  c-0.26-0.86-0.52-1.72-0.77-2.58C114.11,116.05,120.83,113.67,127.6,111.6 M102.57,124.17c0.26,8.9,0.6,18.37,0.66,26.98  c1.66-7.98,3.39-15.93,5.22-23.88C106.73,126.21,104.32,125.18,102.57,124.17 M131.24,142.54c-7.4-5.34-14.98-10.45-22.76-15.27  c1.58-0.11,3.19-0.26,4.76-0.34C119.42,131.92,125.42,137.14,131.24,142.54 M103.26,124.17c-12.77,0.17-22.76,0.75-35.21,1.84  c10.76,0.03,19.11,0.43,30.05,1.29C99.79,126.24,101.51,125.2,103.26,124.17 M75.28,142.54c7.43-5.34,15.01-10.45,22.79-15.24  c0.23,1,0.46,1.98,0.69,2.98C90.78,134.1,82.97,138.21,75.28,142.54 M104.5,174.81c0-3.47,0-6.92-0.03-10.36  c-0.37-0.26-0.86-0.52-1.23-0.78c-0.37,0.26-0.92,0.52-1.29,0.78c0,3.44,0,6.92,0,10.36c0.4,0.26,0.92,0.55,1.29,0.83  C103.61,175.38,104.13,175.09,104.5,174.81 M42.99,149.74c-0.2,0.37-0.4,0.77-0.6,1.18c0.37,0.14,1.12,0.37,1.44,0.52  c3.62-1.92,7.2-3.87,10.76-5.74c0.14-0.55,0.23-0.86,0.37-1.26c-0.37-0.09-0.75-0.2-1.09-0.29  C50.22,145.96,46.6,147.82,42.99,149.74 M40.32,128.47c-0.34,0.26-0.66,0.52-1,0.8l0.55,0.75c3.39-0.49,6.77-0.89,10.16-1.23  c0.32-0.32,0.69-0.66,1-0.95l-0.6-0.6C47.06,127.58,43.7,127.98,40.32,128.47 M53.33,111.32c-0.34,0.14-0.69,0.29-1.03,0.43  l0.09,0.77c2.5,0.34,4.99,0.77,7.46,1.26c0.32-0.2,0.75-0.46,1.06-0.6l-0.14-0.66C58.3,112.07,55.8,111.67,53.33,111.32   M129.53,100.74c-1.32,0.83-2.61,1.69-3.9,2.53l0.37,0.43c0.34,0,0.66,0,1,0c1.26-0.89,2.53-1.75,3.85-2.58l-0.37-0.37  C130.16,100.74,129.84,100.74,129.53,100.74 M102.35,97.14c0,1.03,0,2.04-0.03,3.04l0.75,0.26l0.75-0.26c0-1-0.03-2.04-0.03-3.04  l-0.72-0.23L102.35,97.14 M75.07,101.2c1.32,0.83,2.58,1.69,3.85,2.61c0.32,0,0.8-0.09,1.12-0.09l0.37-0.43  c-1.26-0.89-2.55-1.72-3.87-2.55c-0.32,0-0.63,0-0.95,0L75.07,101.2 M67.12,168.48c2.53-3.04,5.11-6.06,7.66-9.04  c-0.14-0.29-0.37-0.8-0.49-1.12c-0.52,0.09-1.15,0.2-1.66,0.32c-2.61,2.98-5.17,6-7.69,9.01c0.11,0.37,0.37,0.72,0.49,1.09  C65.94,168.59,66.6,168.59,67.12,168.48 M162.65,149.74c-3.59-1.92-7.23-3.79-10.88-5.6c-0.34,0.09-0.72,0.2-1.09,0.29  c0.14,0.4,0.23,0.72,0.37,1.26c3.56,1.87,7.15,3.82,10.76,5.74c0.32-0.14,1.06-0.37,1.44-0.52  C163.05,150.52,162.85,150.12,162.65,149.74 M165.32,128.47c-3.36-0.49-6.74-0.89-10.1-1.23l-0.6,0.6c0.32,0.29,0.69,0.63,1,0.95  c3.39,0.34,6.77,0.75,10.16,1.23l0.55-0.75C165.98,128.98,165.66,128.72,165.32,128.47 M152.34,111.32  c-2.5,0.34-4.99,0.75-7.49,1.21l-0.11,0.66c0.32,0.14,0.75,0.4,1.06,0.6c2.47-0.49,4.97-0.92,7.46-1.26l0.11-0.77  C153.02,111.61,152.68,111.47,152.34,111.32 M138.52,168.48c0.43,0.06,1.18,0.17,1.69,0.26c0.17-0.34,0.32-0.72,0.49-1.09  c-2.53-3.01-5.08-6.03-7.69-9.01c-0.52-0.11-1.15-0.23-1.66-0.32c-0.11,0.32-0.34,0.83-0.49,1.12  C133.44,162.42,135.99,165.44,138.52,168.48"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#C4161D"
        d="M102.99,124.32l0.26-0.17v0.37c-1.72,1.03-3.42,2.04-5.11,3.07  l-0.06-0.32c1.55-0.95,3.1-1.89,4.65-2.81L102.99,124.32 M108.3,121.27c-0.26-0.86-0.52-1.72-0.77-2.58V119  c0.23,0.78,0.46,1.55,0.69,2.32L108.3,121.27"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#C82128"
        d="M103.25,103.36c1.92,4.62,3.59,9.3,5.17,14.03  c7.69-2.84,15.1-5.14,23.05-7.2l0.83-0.52c-8.24,2.1-15.9,4.48-23.88,7.4c-1.58-4.74-3.24-9.41-5.17-14.03  c-1.92,4.62-3.59,9.3-5.17,14.03c-7.95-2.93-15.78-5.42-24.02-7.52l0.83,0.52c7.95,2.07,15.5,4.48,23.19,7.32  C99.66,112.65,101.32,107.98,103.25,103.36"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#C95222"
        d="M42.95,150.34l-0.34,0.63l-0.23-0.09c0.2-0.4,0.4-0.77,0.6-1.18  c3.62-1.92,7.23-3.79,10.88-5.6c0.37,0.09,0.72,0.2,1.09,0.29l-0.2,0.63c-0.29-0.09-0.69-0.14-0.98-0.23  C50.13,146.61,46.57,148.42,42.95,150.34 M40.45,128.94c3.36-0.49,6.66-0.89,10.07-1.26l0.34,0.34l0.2-0.2l-0.6-0.6  c-3.39,0.34-6.74,0.78-10.13,1.26c-0.32,0.29-0.66,0.55-0.98,0.8l0.23,0.32L40.45,128.94 M53.38,111.92  c2.47,0.34,7.52,1.35,7.58,1.32l-0.14-0.66c-2.5-0.49-4.97-0.89-7.46-1.23c-0.34,0.14-0.69,0.29-1.03,0.43l0.06,0.52L53.38,111.92z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#A61B20"
        d="M108.45,127.27c7.81,4.79,15.38,9.93,22.76,15.27V143  c-9.76-7.03-17.48-12.08-22.79-15.35c-1.84,7.95-3.53,15.84-5.19,23.82v-0.32C104.87,143.26,106.65,135.1,108.45,127.27   M116.72,127.9l-0.34-0.29v0.49c7.26,6.14,13.06,11.65,19.8,18.34l1.15,0.66C130.23,140.04,123.89,133.98,116.72,127.9   M115.99,121.28v0.37c10.33,1.32,19.8,2.96,29.99,5.11c0.52,0,1.26,0.03,1.78,0.03C137.06,124.47,126.87,122.66,115.99,121.28   M103.25,124.15h0.52H103.25l0.26,0.17l0.32,0.17c12.54,0.03,25,0.66,37.45,1.92v-0.34C128.65,124.81,115.96,124.18,103.25,124.15   M108.3,121.27l0.46,0.06c6.14-3.39,12.43-6.57,18.86-9.41v-0.32C121.01,114.5,114.58,117.77,108.3,121.27 M130.48,101.28l0.06,0.06  l0.32-0.2l-0.37-0.37c-0.32,0-0.63,0-0.95,0c-1.32,0.83-2.61,1.66-3.87,2.55l0.29,0.32c1.18-0.8,2.38-1.61,3.59-2.35  C129.85,101.28,130.16,101.28,130.48,101.28 M74.24,158.75l0.46,0.86l0.14-0.14c-0.06-0.14-0.34-0.83-0.49-1.12  c-0.52,0.11-1.15,0.23-1.66,0.32c-2.58,2.98-5.17,5.97-7.69,9.01l0.2,0.43c1.64-1.92,5.14-6.14,7.69-9.07  C73.26,158.89,73.81,158.84,74.24,158.75 M162.71,150.34l0.34,0.63l0.23-0.09c-0.2-0.4-0.4-0.77-0.6-1.18  c-3.62-1.92-7.23-3.79-10.88-5.6c-0.37,0.09-0.75,0.2-1.09,0.29l0.2,0.63l0.98-0.23C155.51,146.61,159.09,148.42,162.71,150.34   M165.22,128.94l0.86,0.66l0.23-0.32c-0.32-0.26-0.66-0.52-0.98-0.8c-3.39-0.49-6.74-0.92-10.13-1.26l-0.6,0.6l0.2,0.2l0.34-0.34  C158.53,128.05,161.83,128.45,165.22,128.94 M153.29,112.29l0.06-0.52c-0.34-0.14-0.69-0.29-1.03-0.43  c-2.5,0.34-4.99,0.75-7.46,1.23l-0.14,0.66c0.06,0.03,5.11-0.98,7.58-1.32L153.29,112.29z M131.43,158.75  c0.4,0.09,0.98,0.14,1.35,0.32c2.55,2.93,6.08,7.12,7.72,9.04l0.17-0.43c-2.53-3.04-5.11-6.03-7.69-9.01  c-0.52-0.09-1.15-0.2-1.66-0.32c-0.14,0.29-0.43,0.98-0.49,1.12l0.14,0.14L131.43,158.75 M104.26,164.82l0.23,9.99l-0.03-10.36  c-0.37-0.26-0.86-0.52-1.23-0.77c-0.37,0.26-0.92,0.52-1.29,0.77v10.36l0.23-9.99c0.32-0.2,0.75-0.4,1.03-0.6L104.26,164.82z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#C93E25"
        d="M90.09,128.3c-7.29,6.14-13.26,11.54-20.03,18.22l-1.09,0.63  c6.89-6.83,13.72-13.03,21.12-19.31V128.3z M98.17,121.29l-0.49,0.06c-1.41,0.14-2.81,0.29-4.22,0.46c-4.74-3.59-9.59-7-14.61-10.19  v0.37c5.02,3.19,9.87,6.6,14.61,10.19c1.55-0.17,3.13-0.34,4.68-0.49c1.52,0.83,2.96,1.64,4.48,2.53h0.6  C101.58,123.21,99.83,122.21,98.17,121.29 M75.28,142.98c7.69-4.33,15.53-8.44,23.48-12.25v-0.43c-7.98,3.82-15.79,7.92-23.48,12.25  V142.98z M90.13,121.38c-10.76,1.38-21.24,3.19-31.83,5.45c0.52,0,1.15,0.03,1.69,0.03c10.19-2.15,20.15-3.85,30.48-5.17v-0.37  L90.13,121.38z M98.08,127.29c-10.02-0.86-19.98-1.35-30.02-1.29v0.32c9.9-0.09,19.75,0.4,29.62,1.26L98.08,127.29 M76.57,101.18  c1.21,0.75,2.38,1.61,3.56,2.41l0.29-0.32c-1.26-0.89-2.55-1.75-3.87-2.55c-0.32,0-0.63,0-0.95,0l-0.52,0.46l0.32,0.2l0.23-0.2  C75.94,101.18,76.25,101.18,76.57,101.18 M53.05,127.37c-5.6,25.05,31.83,34.41,49.97,34.41s55.56-9.36,49.94-34.41  c-4.53-20.12-32.46-26.12-49.97-26.12C85.48,101.25,57.55,107.22,53.05,127.37 M54.88,127.23c-5.25,24.08,30.68,32.98,48.13,32.98  c17.45,0,53.38-8.9,48.13-32.98C146.9,107.77,119.89,102,103.01,102C86.14,102,59.13,107.77,54.88,127.23"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#FFFFFF"
        d="M53.22,128c4.51-20.15,31.28-26.23,49.94-26.23  c18.63,0,45.43,6.08,49.94,26.23c5.63,25.05-31.8,34.38-49.94,34.38C85.02,162.38,47.59,153.05,53.22,128 M55.05,127.85  c4.25-19.46,31.25-25.23,48.13-25.23c16.85,0,43.88,5.77,48.13,25.23c5.25,24.08-30.68,32.98-48.13,32.98S49.8,151.9,55.05,127.85"
      />
      <linearGradient
        id={`${id}-SVGID_3_`}
        gradientUnits="userSpaceOnUse"
        x1="-555.066"
        y1="256.1569"
        x2="-552.5981"
        y2="256.1569"
        gradientTransform="matrix(45.2844 -7.9848 -7.9848 -45.2844 27205.0078 7306.6411)"
      >
        <stop offset="0" stopColor="#996F5B" />
        <stop offset="3.460000e-03" stopColor="#996F5B" />
        <stop offset="0.0112" stopColor="#996F5B" />
        <stop offset="0.019" stopColor="#996E5A" />
        <stop offset="0.0267" stopColor="#996E5A" />
        <stop offset="0.0345" stopColor="#996D5A" />
        <stop offset="0.0422" stopColor="#996D5A" />
        <stop offset="0.05" stopColor="#996D59" />
        <stop offset="0.0578" stopColor="#996C59" />
        <stop offset="0.0655" stopColor="#996C59" />
        <stop offset="0.0733" stopColor="#996C59" />
        <stop offset="0.081" stopColor="#996B58" />
        <stop offset="0.0888" stopColor="#996B58" />
        <stop offset="0.0966" stopColor="#996A58" />
        <stop offset="0.1043" stopColor="#996A58" />
        <stop offset="0.1121" stopColor="#996A57" />
        <stop offset="0.1198" stopColor="#996957" />
        <stop offset="0.1276" stopColor="#996957" />
        <stop offset="0.1354" stopColor="#996956" />
        <stop offset="0.1431" stopColor="#996856" />
        <stop offset="0.1509" stopColor="#996856" />
        <stop offset="0.1586" stopColor="#996756" />
        <stop offset="0.1664" stopColor="#996755" />
        <stop offset="0.1741" stopColor="#9A6755" />
        <stop offset="0.1819" stopColor="#9A6655" />
        <stop offset="0.1897" stopColor="#9A6655" />
        <stop offset="0.1974" stopColor="#9A6654" />
        <stop offset="0.2052" stopColor="#9A6554" />
        <stop offset="0.2129" stopColor="#9A6554" />
        <stop offset="0.2207" stopColor="#9A6454" />
        <stop offset="0.2285" stopColor="#9A6453" />
        <stop offset="0.2362" stopColor="#9A6453" />
        <stop offset="0.244" stopColor="#9A6353" />
        <stop offset="0.2517" stopColor="#9A6352" />
        <stop offset="0.2595" stopColor="#9A6352" />
        <stop offset="0.2672" stopColor="#9A6252" />
        <stop offset="0.275" stopColor="#9A6252" />
        <stop offset="0.2828" stopColor="#9A6151" />
        <stop offset="0.2905" stopColor="#9A6151" />
        <stop offset="0.2983" stopColor="#9A6151" />
        <stop offset="0.306" stopColor="#9A6051" />
        <stop offset="0.3138" stopColor="#9A6050" />
        <stop offset="0.3216" stopColor="#9A6050" />
        <stop offset="0.3293" stopColor="#9A5F50" />
        <stop offset="0.3371" stopColor="#9A5F50" />
        <stop offset="0.3448" stopColor="#9A5E4F" />
        <stop offset="0.3526" stopColor="#9A5E4F" />
        <stop offset="0.3604" stopColor="#9A5E4F" />
        <stop offset="0.3681" stopColor="#9A5D4F" />
        <stop offset="0.3759" stopColor="#9A5D4E" />
        <stop offset="0.3836" stopColor="#9A5D4E" />
        <stop offset="0.3914" stopColor="#9A5C4E" />
        <stop offset="0.3991" stopColor="#9A5C4D" />
        <stop offset="0.4069" stopColor="#9A5B4D" />
        <stop offset="0.4147" stopColor="#9A5B4D" />
        <stop offset="0.4224" stopColor="#9A5B4D" />
        <stop offset="0.4302" stopColor="#9A5A4C" />
        <stop offset="0.4379" stopColor="#9A5A4C" />
        <stop offset="0.4457" stopColor="#9A5A4C" />
        <stop offset="0.4535" stopColor="#9A594C" />
        <stop offset="0.4612" stopColor="#9A594B" />
        <stop offset="0.469" stopColor="#9A584B" />
        <stop offset="0.4767" stopColor="#9A584B" />
        <stop offset="0.4845" stopColor="#9A584B" />
        <stop offset="0.4922" stopColor="#9A574A" />
        <stop offset="0.5" stopColor="#9A574A" />
        <stop offset="0.5078" stopColor="#9B574A" />
        <stop offset="0.5155" stopColor="#9B5649" />
        <stop offset="0.5233" stopColor="#9B5649" />
        <stop offset="0.531" stopColor="#9B5549" />
        <stop offset="0.5388" stopColor="#9B5549" />
        <stop offset="0.5465" stopColor="#9B5548" />
        <stop offset="0.5543" stopColor="#9B5448" />
        <stop offset="0.5621" stopColor="#9B5448" />
        <stop offset="0.5698" stopColor="#9B5448" />
        <stop offset="0.5776" stopColor="#9B5347" />
        <stop offset="0.5853" stopColor="#9B5347" />
        <stop offset="0.5931" stopColor="#9B5247" />
        <stop offset="0.6009" stopColor="#9B5247" />
        <stop offset="0.6086" stopColor="#9B5246" />
        <stop offset="0.6164" stopColor="#9B5146" />
        <stop offset="0.6241" stopColor="#9B5146" />
        <stop offset="0.6319" stopColor="#9B5145" />
        <stop offset="0.6396" stopColor="#9B5045" />
        <stop offset="0.6474" stopColor="#9B5045" />
        <stop offset="0.6552" stopColor="#9B4F45" />
        <stop offset="0.6629" stopColor="#9B4F44" />
        <stop offset="0.6707" stopColor="#9B4F44" />
        <stop offset="0.6784" stopColor="#9B4E44" />
        <stop offset="0.6862" stopColor="#9B4E44" />
        <stop offset="0.694" stopColor="#9B4E43" />
        <stop offset="0.7017" stopColor="#9B4D43" />
        <stop offset="0.7095" stopColor="#9B4D43" />
        <stop offset="0.7172" stopColor="#9B4C43" />
        <stop offset="0.725" stopColor="#9B4C42" />
        <stop offset="0.7328" stopColor="#9B4C42" />
        <stop offset="0.7405" stopColor="#9B4B42" />
        <stop offset="0.7483" stopColor="#9B4B41" />
        <stop offset="0.756" stopColor="#9B4B41" />
        <stop offset="0.7638" stopColor="#9B4A41" />
        <stop offset="0.7715" stopColor="#9B4A41" />
        <stop offset="0.7793" stopColor="#9B4A40" />
        <stop offset="0.7871" stopColor="#9B4940" />
        <stop offset="0.7948" stopColor="#9B4940" />
        <stop offset="0.8026" stopColor="#9B4840" />
        <stop offset="0.8103" stopColor="#9B483F" />
        <stop offset="0.8181" stopColor="#9B483F" />
        <stop offset="0.8259" stopColor="#9B473F" />
        <stop offset="0.8336" stopColor="#9C473F" />
        <stop offset="0.8414" stopColor="#9C473E" />
        <stop offset="0.8491" stopColor="#9C463E" />
        <stop offset="0.8569" stopColor="#9C463E" />
        <stop offset="0.8647" stopColor="#9C453E" />
        <stop offset="0.8724" stopColor="#9C453D" />
        <stop offset="0.8802" stopColor="#9C453D" />
        <stop offset="0.8879" stopColor="#9C443D" />
        <stop offset="0.8957" stopColor="#9C443C" />
        <stop offset="0.9034" stopColor="#9C443C" />
        <stop offset="0.9112" stopColor="#9C433C" />
        <stop offset="0.919" stopColor="#9C433C" />
        <stop offset="0.9267" stopColor="#9C423B" />
        <stop offset="0.9345" stopColor="#9C423B" />
        <stop offset="0.9422" stopColor="#9C423B" />
        <stop offset="0.95" stopColor="#9C413B" />
        <stop offset="0.9578" stopColor="#9C413A" />
        <stop offset="0.9655" stopColor="#9C413A" />
        <stop offset="0.9733" stopColor="#9C403A" />
        <stop offset="0.981" stopColor="#9C403A" />
        <stop offset="0.9888" stopColor="#9C3F39" />
        <stop offset="0.9965" stopColor="#9C3F39" />
        <stop offset="1" stopColor="#9C3F39" />
      </linearGradient>
      <path
        fill={`url(#${id}-SVGID_3_)`}
        d="M102.64,125.97c0,0.43,0.03,0.89,0.03,1.32c1.17-0.31,2.24-0.6,2.24-0.6  c0.37-0.06,0.75-0.06,1.15-0.06c0.26,0,0.54,0,0.8,0.03c0.03-0.08,0.03-0.14,0.06-0.23c-1.09-0.57-2.3-1.15-3.36-1.69  C103.28,125.11,102.96,125.51,102.64,125.97 M105.14,123.04c-0.38,0.37-0.75,0.75-1.09,1.12c1.09,0,2.18,0.03,3.27,0.03  c0.11-0.83,0.2-1.7,0.23-2.56C106.78,122.13,105.97,122.59,105.14,123.04"
      />
      <path
        fill="#8A223A"
        d="M124.01,112.22c-0.23-0.06-0.43-0.12-0.6-0.14c2.9-0.86,5.85-1.66,8.87-2.44l-0.83,0.52c0,0,0,0-0.03,0  C128.92,110.85,126.45,111.53,124.01,112.22"
      />
      <path
        fill="#7C1E33"
        d="M155.8,146.16c-0.66-0.32-1.26-0.63-1.78-0.89C154.62,145.56,155.2,145.85,155.8,146.16 M118.96,129.81  c-0.75-0.63-1.49-1.29-2.21-1.89l-0.34-0.29v0.49c0.55,0.49,1.09,0.95,1.64,1.41C118.33,129.61,118.64,129.7,118.96,129.81   M147.78,126.77c-3.85-0.83-7.63-1.58-11.37-2.3c0.09,0.11,0.17,0.26,0.26,0.4c3.07,0.57,6.17,1.21,9.33,1.87l0,0  C146.52,126.74,147.26,126.77,147.78,126.77 M125.94,125.2c-0.63-0.17-1.38-0.34-2.18-0.46c-6.54-0.37-13.12-0.55-19.66-0.57  c-0.11,0.11-0.2,0.2-0.29,0.32l0.03,0.03C111.21,124.54,118.59,124.77,125.94,125.2 M141.26,126.44v-0.34  c-1.32-0.11-2.67-0.26-4.02-0.37c0.09,0.12,0.17,0.26,0.26,0.37C138.76,126.18,140,126.32,141.26,126.44 M125.86,112.68  c0.57-0.26,1.15-0.52,1.72-0.77v-0.32c-0.72,0.32-1.46,0.63-2.18,0.98C125.6,112.62,125.75,112.65,125.86,112.68"
      />
      <path
        fill="#9C3F39"
        d="M165.18,150.21c-1.64-0.55-6.08-2.44-9.36-4.05c-0.6-0.32-1.18-0.6-1.78-0.89  c-0.89-0.46-1.55-0.86-1.87-1.15c0,0-0.6-0.32-1.49-0.8c2.3-3.62,3.44-7.81,2.9-12.66l1.03,0.23l8.18,1.23l5.77,1.21  c0.03,0.14,0.03,0.26,0.06,0.4c0.14,1.09,0.23,2.18,0.23,3.27c0,4.08-1,8.15-3.13,12.14C165.56,149.52,165.38,149.87,165.18,150.21   M125.4,112.59c0.75-0.34,1.46-0.69,2.18-1l0,0c-0.92,0.29-1.81,0.57-2.73,0.86C125.05,112.51,125.23,112.56,125.4,112.59   M123.71,124.73c-0.66-0.09-1.41-0.17-2.21-0.23c-7.86-0.69-10.88-1.75-11.65-2.01c-1.41-0.49-1.43-0.75-2.27-0.86  c-0.03,0.86-0.11,1.72-0.23,2.55C112.8,124.27,118.25,124.45,123.71,124.73 M141.27,126.08c-1.43-0.26-2.87-0.52-4.28-0.75  c0.09,0.11,0.17,0.26,0.26,0.37C138.57,125.82,139.92,125.94,141.27,126.08 M107.46,126.68c-0.17-0.09-0.34-0.17-0.52-0.29  c-0.03,0.09-0.03,0.14-0.06,0.23C107.09,126.66,107.26,126.66,107.46,126.68 M115.3,128.58c-0.69-0.55-1.38-1.09-2.04-1.66  c-1.03,0.06-2.04,0.11-3.04,0.2c1.03,0.23,1.72,0.43,1.72,0.43C112.97,127.78,114.41,128.26,115.3,128.58 M148.5,142.21  c2.32-3.53,3.5-7.63,3.01-12.37c-1.18-0.66-2.44-1.64-3.16-2.73c-1.12-1.75-3.87-4.79-5.4-6.69c-2.1-2.61-6.86-5.02-7.55-6.11  c-0.69-1.09-1.84-2.98-2.15-3.73c-0.32-0.72-0.98-1.29-2.09-1.29c-0.06,0-0.14,0-0.2,0c-1.26,0.09-1.35,0.52-2.41,0.57  c-0.14,0-0.29,0-0.43,0c-1,0-2.12-0.17-2.12-0.17c-0.66-0.11-1.09-0.2-1.55-0.2c-0.63,1.09-1.64,1.75-4.08,1.75l-0.43-0.06  c0.23,0.52,2.35,0.83,2.84,0.83c0.03,0,0.03,0,0.06,0h0.03c0.11,0,0.29,0.03,0.52,0.09c2.9-0.86,5.85-1.66,8.87-2.44l-0.83,0.52  c-0.03,0-0.03,0-0.03,0c-1.41,0.89-2.78,1.81-4.13,2.73c0.23,0.11,0.55,0.26,0.98,0.52c2.64,1.49,6.54,5.65,7.32,9.27  c0.11,0.52,0.43,1.12,0.83,1.75c3.76,0.69,7.55,1.46,11.39,2.3c-0.52,0-1.26-0.03-1.78-0.03c-1.52-0.03-3.04-0.03-4.56-0.03  c-1.18,0-2.3,0.03-3.44,0.03c0.86,1.15,1.66,2.27,1.84,3.1c-3.47-0.23-7.81-2.04-9.7-2.9c-4.53,0.14-9.07,0.4-13.75,0.69  c0.86,0.75,1.72,1.49,2.55,2.21c3.53,1.15,9.24,3.16,11.11,4.51c1.81,1.32,11.14,4.79,13.6,5.65  C144.8,140.37,146.75,141.32,148.5,142.21 M167.02,127.66c-0.11-0.29-0.2-0.57-0.37-0.8c-0.2-0.49-0.43-0.95-0.66-1.43  c0-0.03-0.03-0.03-0.03-0.06v-0.03c0-0.03,0-0.03,0-0.03c-0.06-0.09-0.09-0.2-0.14-0.29c-0.29-0.6-0.63-1.21-0.98-1.78  c-0.11-0.03-1.52-0.43-5.08-0.43c-0.34,0-0.72,0-1.09,0c-0.03,0-0.03,0-0.06,0c-0.77,0-1.64,0.2-1.64,0.2l-2.24,1.32  c-0.29,0.46,0.72,1.06,0.72,1.06s2.81,0.17,2.81,0.92C160.33,127.43,164.75,127.55,167.02,127.66 M138.2,151.34  c0.86-0.49,1.69-1.03,2.53-1.58c-0.49-0.09-1.18-0.17-2.1-0.17C137.83,149.59,137.88,150.42,138.2,151.34 M157.86,159.15  c0.34-0.32,0.66-0.63,1.03-0.92c1.29-1.26,2.41-2.53,3.44-3.82c-4.97-0.11-12.03-0.2-17.39-2.98c-0.17-0.55-0.57-0.83-1-1  c-1.46,1.12-3.04,2.12-4.74,3.07c0.14,0.23,0.23,0.4,0.23,0.4c1.64,1.09,7.52,2.76,8.75,2.93c1.23,0.14,5.34,1.38,5.34,1.38  S155.65,158.49,157.86,159.15"
      />
      <path
        fill="#892F3B"
        d="M148.93,142.43c-0.14-0.06-0.29-0.14-0.43-0.2c2.32-3.53,3.5-7.61,3.04-12.34c0.03,0.03,0.06,0.03,0.09,0.06  C152.26,134.68,151.17,138.84,148.93,142.43 M138.42,151.94c1.06-0.63,2.07-1.26,3.04-1.95c-0.17-0.06-0.43-0.14-0.75-0.2  c-0.8,0.55-1.66,1.06-2.53,1.58C138.28,151.54,138.34,151.74,138.42,151.94"
      />
      <path
        fill="#987A8F"
        d="M127.28,112.94c-0.6-0.26-0.69-0.11-1.41-0.23h-0.03c0.57-0.26,1.15-0.52,1.75-0.77v-0.32  c-0.92,0.29-1.84,0.57-2.73,0.86c-0.29-0.06-0.57-0.14-0.86-0.2c2.44-0.72,4.91-1.38,7.43-2.04  C130.01,111.1,128.63,112.02,127.28,112.94 M105.15,123.04c0.2-0.17,0.37-0.37,0.6-0.57c0.32-0.29,0.52-0.6,0.69-0.89l0.72,0.03  c0.17,0,0.32,0.03,0.46,0.03C106.76,122.12,105.96,122.58,105.15,123.04 M146,126.74c-1.52-0.03-3.04-0.03-4.56-0.03  c-1.15,0-2.3,0-3.42,0.03c-0.17-0.23-0.32-0.43-0.49-0.66c1.26,0.11,2.5,0.23,3.76,0.34v-0.34c-1.35-0.14-2.7-0.26-4.02-0.37  c1.35,0.11,2.7,0.26,4.02,0.37c-1.44-0.26-2.87-0.52-4.31-0.75c-0.11-0.14-0.2-0.32-0.32-0.46  C139.74,125.45,142.84,126.08,146,126.74 M147.77,126.77L147.77,126.77c-3.85-0.83-7.63-1.61-11.39-2.3  C140.17,125.19,143.93,125.94,147.77,126.77 M100.48,127.83c0.66-0.17,1.23-0.49,1.55-1c0.2-0.32,0.4-0.6,0.57-0.86  c0,0.46,0.03,0.89,0.03,1.32C101.91,127.49,101.08,127.69,100.48,127.83 M118.96,129.81L118.96,129.81  c-0.75-0.63-1.46-1.26-2.21-1.89l-0.34-0.29v0.49c0.55,0.46,1.09,0.95,1.64,1.41c-1.18-0.37-1.95-0.63-1.95-0.63  s-0.32-0.11-0.77-0.29c-0.69-0.57-1.35-1.12-2.04-1.66c-1,0.06-2.04,0.14-3.04,0.2c-0.77-0.17-1.75-0.34-2.76-0.43  c-0.17-0.09-0.34-0.17-0.52-0.29c-1.09-0.57-2.3-1.15-3.36-1.69c0.06-0.09,0.14-0.17,0.2-0.23l0.03,0.03  c7.38,0.03,14.75,0.26,22.1,0.69c1.58,0.43,2.47,0.89,2.47,0.89l0.77,0.37c0,0,0.37,0.17,0.98,0.46c-4.53,0.14-9.1,0.4-13.75,0.69  C117.27,128.35,118.1,129.07,118.96,129.81 M150.65,143.31c2.3-3.62,3.44-7.81,2.93-12.66h-0.03c-0.52-0.11-1.18-0.37-1.89-0.75  c0.6,4.79-0.49,8.95-2.73,12.51C149.56,142.73,150.16,143.05,150.65,143.31 M165.99,125.31L165.99,125.31 M166.02,125.37  c0-0.03-0.03-0.03-0.03-0.06C166.02,125.34,166.02,125.37,166.02,125.37 M139.18,153.47c1.66-0.95,3.27-1.95,4.76-3.07  c-0.37-0.14-0.77-0.17-1.12-0.17c-0.43,0-0.77,0.06-0.77,0.06s-0.11-0.14-0.55-0.32c-0.98,0.69-2.01,1.32-3.07,1.95  C138.66,152.52,138.98,153.1,139.18,153.47"
      />
      <path
        fill="#F9A93F"
        d="M126.9,72.17l-1.69-1.58c-0.11-0.52,0.46-1.23,0.6-2.12l-0.52-0.2c-0.4-1.52-0.75-4.28,0-5.74  c0.34-0.72,0.77-1.66,0.55-2.5c-1.38-4.68-4.08-8.75-5.97-13.17c-0.52-1.21-0.43-2.07-0.52-3.3c-1.46-1.64-3.19-5.88-3.99-8.5  c-1.72,4.33-2.87,9.33-2.87,10.48c0,4.88,4.97,7.26,3.24,15.38c-0.34,1.58-0.92,3.73-1.49,5.97c1.03,5.65,1.03,9.76,2.55,16.33  c2.12,2.09,3.87,4.79,4.82,8.21c0.57,2.12,2.35,7.09,4.65,7.81c1.41,0.46-4.79,1.61-6.54-0.6c-1.69-2.12-4.62-3.82-6-6.06  c-1.09-1.78-2.81-5.63-3.9-7.43l-1.32,6.95c1.81,7.43,0.72,9.07-0.89,15.1c-0.69,2.61-5.94-9.59-5.97-10.53  c0-2.64-0.17-3.62-0.77-5.97c-1.09-2.15-0.98-5.19-0.83-7.52c0.26-3.87,0.23-11.16,0.37-13.09c-1.32-3.27-4.74-9.16-5.08-12.46  c-0.52-5.17,0.34-10.39-0.37-15.56c-0.89,2.58-1.84,5.85-3.85,7.84c-3.01,2.96-5.77,6.23-8.47,9.5c-0.98,1.35-0.11,1.98-1.64,4.13  c-1.49,2.09-0.69,1.15-1,3.16c-0.06,0.34-0.23,0.63-0.34,0.75c-0.8,0.66-1.64,1.23-2.78,0.77c-2.21-1.12-2.38-2.76-2.53-4.85  c-0.29-4.02,2.7-4.22,4.39-6.66c3.3-4.79,4.99-12.83,8.55-16.44c0.23-0.72,1.06-3.3,2.64-7.12c0.06-4.76,1.23-9.01,6.14-10.96  c2.01-0.8,4.65-1,4.74-3.79c0-0.34-0.06-1.18-0.26-1.49c-0.8-0.66-1.38-0.66-1.78-1.12c-0.8-1.03-1.46-7.58-1.38-8.01  c1.15-5.57,3.82-7.4,7.18-7.26c3.99,0.2,7.15,2.12,6.97,7.46c-0.14,4.31-4.59,9.84,2.07,11.94c2.55,0.8,3.01,0.26,5.22,2.44  c2.44,2.47,3.04,6.83,3.44,10.88l2.5,5.8c4.59,7.72,2.93,10.16,4.59,17.99c0.43,2.04,1.18,3.82,1.35,8.27  C130.89,67.35,129.22,72.09,126.9,72.17"
      />
      <linearGradient
        id={`${id}-SVGID_4_`}
        gradientUnits="userSpaceOnUse"
        x1="-564.7075"
        y1="262.6658"
        x2="-562.2404"
        y2="262.6658"
        gradientTransform="matrix(26.2212 26.2212 26.2212 -26.2212 8000.6489 21739.6152)"
      >
        <stop offset="0" stopColor="#2C3696" />
        <stop offset="4.280000e-03" stopColor="#2C3696" />
        <stop offset="0.012" stopColor="#2C3696" />
        <stop offset="0.0198" stopColor="#2C3696" />
        <stop offset="0.0275" stopColor="#2C3695" />
        <stop offset="0.0353" stopColor="#2C3695" />
        <stop offset="0.043" stopColor="#2C3695" />
        <stop offset="0.0507" stopColor="#2C3595" />
        <stop offset="0.0585" stopColor="#2C3594" />
        <stop offset="0.0662" stopColor="#2B3594" />
        <stop offset="0.074" stopColor="#2B3594" />
        <stop offset="0.0817" stopColor="#2B3594" />
        <stop offset="0.0895" stopColor="#2B3593" />
        <stop offset="0.0972" stopColor="#2B3593" />
        <stop offset="0.105" stopColor="#2B3593" />
        <stop offset="0.1127" stopColor="#2B3593" />
        <stop offset="0.1205" stopColor="#2B3592" />
        <stop offset="0.1282" stopColor="#2B3592" />
        <stop offset="0.1359" stopColor="#2B3592" />
        <stop offset="0.1437" stopColor="#2B3492" />
        <stop offset="0.1514" stopColor="#2B3492" />
        <stop offset="0.1592" stopColor="#2B3491" />
        <stop offset="0.1669" stopColor="#2B3491" />
        <stop offset="0.1747" stopColor="#2A3491" />
        <stop offset="0.1824" stopColor="#2A3491" />
        <stop offset="0.1902" stopColor="#2A3490" />
        <stop offset="0.1979" stopColor="#2A3490" />
        <stop offset="0.2057" stopColor="#2A3490" />
        <stop offset="0.2134" stopColor="#2A3490" />
        <stop offset="0.2212" stopColor="#2A348F" />
        <stop offset="0.2289" stopColor="#2A348F" />
        <stop offset="0.2367" stopColor="#2A338F" />
        <stop offset="0.2444" stopColor="#2A338F" />
        <stop offset="0.2521" stopColor="#2A338F" />
        <stop offset="0.2599" stopColor="#2A338E" />
        <stop offset="0.2676" stopColor="#2A338E" />
        <stop offset="0.2754" stopColor="#2A338E" />
        <stop offset="0.2831" stopColor="#29338E" />
        <stop offset="0.2909" stopColor="#29338D" />
        <stop offset="0.2986" stopColor="#29338D" />
        <stop offset="0.3064" stopColor="#29338D" />
        <stop offset="0.3141" stopColor="#29338D" />
        <stop offset="0.3219" stopColor="#29328C" />
        <stop offset="0.3296" stopColor="#29328C" />
        <stop offset="0.3373" stopColor="#29328C" />
        <stop offset="0.3451" stopColor="#29328C" />
        <stop offset="0.3528" stopColor="#29328B" />
        <stop offset="0.3606" stopColor="#29328B" />
        <stop offset="0.3683" stopColor="#29328B" />
        <stop offset="0.3761" stopColor="#29328B" />
        <stop offset="0.3838" stopColor="#29328B" />
        <stop offset="0.3916" stopColor="#28328A" />
        <stop offset="0.3993" stopColor="#28328A" />
        <stop offset="0.4071" stopColor="#28328A" />
        <stop offset="0.4148" stopColor="#28318A" />
        <stop offset="0.4225" stopColor="#283189" />
        <stop offset="0.4303" stopColor="#283189" />
        <stop offset="0.438" stopColor="#283189" />
        <stop offset="0.4458" stopColor="#283189" />
        <stop offset="0.4535" stopColor="#283188" />
        <stop offset="0.4613" stopColor="#283188" />
        <stop offset="0.469" stopColor="#283188" />
        <stop offset="0.4768" stopColor="#283188" />
        <stop offset="0.4845" stopColor="#283187" />
        <stop offset="0.4922" stopColor="#283187" />
        <stop offset="0.5" stopColor="#273087" />
        <stop offset="0.5077" stopColor="#273087" />
        <stop offset="0.5155" stopColor="#273087" />
        <stop offset="0.5232" stopColor="#273086" />
        <stop offset="0.531" stopColor="#273086" />
        <stop offset="0.5387" stopColor="#273086" />
        <stop offset="0.5465" stopColor="#273086" />
        <stop offset="0.5542" stopColor="#273085" />
        <stop offset="0.562" stopColor="#273085" />
        <stop offset="0.5697" stopColor="#273085" />
        <stop offset="0.5775" stopColor="#273085" />
        <stop offset="0.5852" stopColor="#273084" />
        <stop offset="0.5929" stopColor="#272F84" />
        <stop offset="0.6007" stopColor="#272F84" />
        <stop offset="0.6084" stopColor="#272F84" />
        <stop offset="0.6162" stopColor="#262F83" />
        <stop offset="0.6239" stopColor="#262F83" />
        <stop offset="0.6317" stopColor="#262F83" />
        <stop offset="0.6394" stopColor="#262F83" />
        <stop offset="0.6472" stopColor="#262F83" />
        <stop offset="0.6549" stopColor="#262F82" />
        <stop offset="0.6627" stopColor="#262F82" />
        <stop offset="0.6704" stopColor="#262F82" />
        <stop offset="0.6781" stopColor="#262F82" />
        <stop offset="0.6859" stopColor="#262E81" />
        <stop offset="0.6936" stopColor="#262E81" />
        <stop offset="0.7014" stopColor="#262E81" />
        <stop offset="0.7091" stopColor="#262E81" />
        <stop offset="0.7169" stopColor="#262E80" />
        <stop offset="0.7246" stopColor="#252E80" />
        <stop offset="0.7324" stopColor="#252E80" />
        <stop offset="0.7401" stopColor="#252E80" />
        <stop offset="0.7479" stopColor="#252E80" />
        <stop offset="0.7556" stopColor="#252E7F" />
        <stop offset="0.7634" stopColor="#252E7F" />
        <stop offset="0.7711" stopColor="#252D7F" />
        <stop offset="0.7788" stopColor="#252D7F" />
        <stop offset="0.7866" stopColor="#252D7E" />
        <stop offset="0.7943" stopColor="#252D7E" />
        <stop offset="0.8021" stopColor="#252D7E" />
        <stop offset="0.8098" stopColor="#252D7E" />
        <stop offset="0.8176" stopColor="#252D7D" />
        <stop offset="0.8253" stopColor="#252D7D" />
        <stop offset="0.8331" stopColor="#242D7D" />
        <stop offset="0.8408" stopColor="#242D7D" />
        <stop offset="0.8486" stopColor="#242D7C" />
        <stop offset="0.8563" stopColor="#242D7C" />
        <stop offset="0.864" stopColor="#242C7C" />
        <stop offset="0.8718" stopColor="#242C7C" />
        <stop offset="0.8795" stopColor="#242C7C" />
        <stop offset="0.8873" stopColor="#242C7B" />
        <stop offset="0.895" stopColor="#242C7B" />
        <stop offset="0.9028" stopColor="#242C7B" />
        <stop offset="0.9105" stopColor="#242C7B" />
        <stop offset="0.9183" stopColor="#242C7A" />
        <stop offset="0.926" stopColor="#242C7A" />
        <stop offset="0.9338" stopColor="#242C7A" />
        <stop offset="0.9415" stopColor="#232C7A" />
        <stop offset="0.9492" stopColor="#232C79" />
        <stop offset="0.957" stopColor="#232B79" />
        <stop offset="0.9647" stopColor="#232B79" />
        <stop offset="0.9725" stopColor="#232B79" />
        <stop offset="0.9802" stopColor="#232B78" />
        <stop offset="0.988" stopColor="#232B78" />
        <stop offset="0.9957" stopColor="#232B78" />
        <stop offset="1" stopColor="#232B78" />
      </linearGradient>
      <path
        fill={`url(#${id}-SVGID_4_)`}
        d="M99.29,7.96c0.03,0.34,0.2,5.63,0.98,6.75c1.52,1.15,2.38,0.8,2.3,3.65  c-0.08,2.38-1.61,3.79-3.67,4.53c-3.36,1.17-5.08,1.86-6.2,5.34c-0.34,1.09-0.66,2.67-0.66,4.99v0.15c-0.95,2.38-2.18,5.11-2.9,7.66  c-4.13,4.16-6.2,13.57-10.39,17.56c-2.78,2.64-3.62,2.81-2.61,6.89c0.11,0.4,1.43,1.47,1.72,1.64l1.29-0.8  c0.2-2.07-0.08-1.89,1.24-3.79c1.21-1.75,0.63-2.67,1.69-4.19c2.64-3.3,5.14-6.63,8.09-9.64c1.98-2.01,4.68-8.81,5.31-11.19  c0.11-0.34,0.31-0.52,0.4-0.23c0.4,4.53,1.06,8.32,0.89,12.8c-0.34,9.39-0.08,8.41,3.82,17.16c0.31-3.53,1.17-8.64,3.21-10.36  c-2.41,9.13-2.56,22.16-2.81,26.14c-0.15,2.04-0.69,5.25,0.29,7.12c0.31,1.26,0.34,3.18,0.37,4.65c0,0.89,0.06,16.01,0.06,16.01  l-1.4,7.03c-0.49,2.04-3.13,5.43-5.05,6.49c-0.6,0.34-2.07,1.12-2.07,1.78c0,1.12,7.14,3.19,8.78,0.66c1.23-1.89,2.24-2.93,3.7-4.34  c2.24-2.15-0.26-4.39,0.06-7.29c0.52-5.08,2.7-9.5,3.42-14.32c0.43-2.9,0.34-5.45-0.95-8.76l0.95-9.18c1.06,1.58,2.04,4.11,3.04,6.2  c1.78,3.73,1.81,4.08,4.91,7.15c1.03,1.03,2.12,2.24,2.9,3.5c1.46,2.3,2.44,4.59,2.32,7.35c-1.06,1.92-1.52,1.81-2.9,2.98  c0.06,0.06-0.38,1.12,0.92,1.12c4.65,0,4.08-2.44,5.82-5.56c1.15-2.04,4.39-5.14,0.83-6.2c-1.12-0.34-2.18-1.01-2.84-2.1  c-2.47-4.13-2.58-4.04-3.87-7.86c-0.78-2.32-2.38-4.19-4.25-5.68c-1.15-2.61-1.61-4.45-1.98-7.23c-0.49-3.76-0.83-6.43-1.49-10.27  c1.81-7.2,2.76-8.73-0.34-15.64c-0.72-1.58-1.12-3.27-1.12-5.17c0-2.3,1.26-7.46,2.49-10.16c0.43-1.09,1.03-2.12,1.87-2.44  c0.75,2.79,3.33,8.53,4.82,9.93c0.08,1.12,0.06,2.27,0.49,3.33c1.89,4.53,4.59,8.64,5.94,13.43c0.46,1.64-0.15,2.44-0.63,3.76  c-0.15,0.63-0.17,2.47,0.11,3.85l0.66,0.34c-0.11,0.4-0.4,1.58-0.63,2.09c0.09,0.66,0.89,1.01,0.89,1.01  c1.03-0.23,2.53-3.99,2.47-5.48c-0.17-4.59-1.12-6.66-1.41-8.01c-1.52-7.78-0.66-9.93-4.99-17.48l-2.47-6.14  c-0.31-3.13-1.55-10.3-5.57-11.59c-0.69-0.2-1.35-0.26-2.38-0.57c-5.25-1.69-5.25-5.74-3.82-10.16c1.29-3.93,1.44-8.55-4.33-9.04  c-0.17-0.03-0.34-0.03-0.52-0.03C101.04,2.19,100.03,4.89,99.29,7.96"
      />
    </g>
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g x="0px" y="0px" fill="#F5F7FA">
    <defs>
      <clipPath id={`${id}-brand-symbol-bounds`}>
        <rect x="0.0" y="0.0" width="206.98" height="200.0" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-brand-symbol-bounds)`}>
      <path
        fill="#7076B8"
        d="M122.39,236.24c-0.89,5.6-3.76,8.52-7.23,8.52c-2.21,0-3.47-1.55-3.1-3.93l1.21-7.58  c0.46-2.81,2.15-5.02,5.17-5.02C121.79,228.23,123.31,230.5,122.39,236.24 M110.54,247.38c0.46,0,1.58,1.95,5.25,1.95  c7.78,0,12.23-5.62,13.43-12.89c1.55-8.95-2.81-13.03-8.29-13.03c-2.58,0-4.51,0.23-5.91,0.98l2.1-12.31h-6.46l-6.43,36.79h4.88  c0,0,0.69-1.52,1.46-1.52h-0.03V247.38z M179.24,231.71c0.98-5.57-1.09-8.29-7.12-8.29c-4.51,0-6.26,1.98-7.95,3.67l0.17-3.1  l-5.97,0.03l-0.46,4.59l-3.47,20.32h6.54l2.1-13.17c0.75-4.53,3.87-8.01,6.83-8.01c3.27,0,3.24,1.87,2.73,4.74l-2.84,16.47h6.49  L179.24,231.71z M206.57,223.47h-7.63l-8.78,9.3l-0.11-0.03l3.5-20.61h-6.37l-6.43,36.76h6.46l0.66-3.67l1.32-8.06  c3.42,0,5.34,0.37,6.83,7.18l1.03,4.56h6.6c0,0-1.64-6.95-2.73-9.67c-1.12-2.87-2.35-4.74-4.97-5.25L206.57,223.47z M18.9,232.48  c4.74-1.03,7.18-4.85,7.84-7.35c1.69-6.83-1.35-12.17-10.07-12.08H6.67l-6.26,35.87h6.51l2.58-14.41c6-0.17,6.74,1.29,7.86,8.29  l1.03,6.11h6.74c-0.8-3.7-1.32-7.2-1.98-10.02c-0.69-2.96-1.81-5.25-4.62-6.34L18.9,232.48z M20.22,223.93  c-0.57,3.19-3.04,5.42-6.08,5.42h-3.85l1.98-11.34l3.5-0.03C19.9,218.02,20.7,220.74,20.22,223.93 M49.63,230.73  c0.95-5.42-1.98-7.32-7.84-7.32c-7.32,0-10.5,3.47-10.5,3.47l2.24,3.79c0,0,2.35-2.76,7.09-2.76c2.64,0,2.7,1.32,2.44,2.76  l-0.52,3.24c-9.41-0.23-14.24,1.78-15.33,7.95c-0.89,5.05,2.9,7.49,7.18,7.49c2.21,0,3.99-0.32,6.14-2.21  c0.43,1.21,1.18,1.87,2.01,2.01c1.35,0.29,3.7-0.03,4.39-0.55c-0.06-0.75,0-2.67,0.8-7.18L49.63,230.73z M41.91,237.33  c-1.03,7.4-2.04,8.15-5.6,8.15c-2.44,0-3.33-1.66-2.93-3.85C33.96,238.62,36.2,237.33,41.91,237.33 M152.9,230.73  c0.95-5.42-1.98-7.32-7.84-7.32c-7.32,0-10.48,3.47-10.48,3.47l2.24,3.79c0,0,2.35-2.76,7.09-2.76c2.64,0,2.7,1.32,2.44,2.76  l-0.52,3.24c-9.41-0.23-14.24,1.78-15.33,7.95c-0.89,5.05,2.9,7.49,7.18,7.49c2.21,0,3.99-0.32,6.14-2.21  c0.43,1.21,1.18,1.87,2.01,2.01c1.35,0.29,3.7-0.03,4.39-0.55c-0.06-0.75,0-2.67,0.8-7.18L152.9,230.73z M145.18,237.33  c-1.03,7.4-2.04,8.15-5.6,8.15c-2.44,0-3.33-1.66-2.93-3.85C137.23,238.62,139.47,237.33,145.18,237.33 M62.69,249.36  c7.78,0,12.23-5.63,13.43-12.89c1.55-8.95-2.81-13.03-8.29-13.03c-2.58,0-4.42,0.23-5.88,0.98l2.1-12.31h-6.49l-6.43,36.79h4.88  c0,0,0.69-1.52,1.41-1.52C57.93,247.38,59.05,249.36,62.69,249.36 M65.42,228.23c3.33,0,4.74,2.24,3.96,8.01  c-0.8,5.88-3.76,8.52-7.29,8.52c-2.21,0-3.47-1.55-3.04-3.93l1.23-7.58c0.46-2.81,2.15-5.02,5.11-5.02H65.42z M78.88,238.48  c1-9.36,5.22-15.15,15.27-15.15c7.46,0,9.9,5.68,8.93,11.8c-1.61,9.79-5.4,14.38-14.95,14.38C81.89,249.5,78.22,244.45,78.88,238.48   M96.24,235.58c0.49-2.58,0.98-7.61-3.47-7.61c-2.98,0-5.8,2.04-7.06,9.16c-0.77,4.33,0.06,7.84,3.53,7.84  C91.82,244.94,94.89,242.84,96.24,235.58"
      />
      <linearGradient
        id={`${id}-SVGID_1_`}
        gradientUnits="userSpaceOnUse"
        x1="-558.2126"
        y1="254.0371"
        x2="-555.7452"
        y2="254.0371"
        gradientTransform="matrix(73.2704 0 0 -73.2704 40935.2188 18762.3984)"
      >
        <stop offset="0" stopColor="#CB582A" />
        <stop offset="2.170000e-03" stopColor="#CB582A" />
        <stop offset="6.060000e-03" stopColor="#CB582A" />
        <stop offset="9.950000e-03" stopColor="#CA592B" />
        <stop offset="0.0138" stopColor="#CA592B" />
        <stop offset="0.0177" stopColor="#CA592C" />
        <stop offset="0.0216" stopColor="#CA5A2D" />
        <stop offset="0.0255" stopColor="#CA5A2D" />
        <stop offset="0.0294" stopColor="#C95A2D" />
        <stop offset="0.0333" stopColor="#C95A2E" />
        <stop offset="0.0372" stopColor="#C95A2E" />
        <stop offset="0.0411" stopColor="#C85B2F" />
        <stop offset="0.045" stopColor="#C85A30" />
        <stop offset="0.0489" stopColor="#C85A30" />
        <stop offset="0.0527" stopColor="#C85B31" />
        <stop offset="0.0566" stopColor="#C85B31" />
        <stop offset="0.0605" stopColor="#C85B31" />
        <stop offset="0.0644" stopColor="#C75B31" />
        <stop offset="0.0683" stopColor="#C75B31" />
        <stop offset="0.0722" stopColor="#C75B32" />
        <stop offset="0.0761" stopColor="#C75C34" />
        <stop offset="0.08" stopColor="#C75C34" />
        <stop offset="0.0838" stopColor="#C65C34" />
        <stop offset="0.0877" stopColor="#C65C34" />
        <stop offset="0.0916" stopColor="#C65C34" />
        <stop offset="0.0955" stopColor="#C55D36" />
        <stop offset="0.0994" stopColor="#C55D37" />
        <stop offset="0.1033" stopColor="#C55D37" />
        <stop offset="0.1072" stopColor="#C45D37" />
        <stop offset="0.1111" stopColor="#C45D37" />
        <stop offset="0.115" stopColor="#C45D37" />
        <stop offset="0.1189" stopColor="#C45E38" />
        <stop offset="0.1227" stopColor="#C45E38" />
        <stop offset="0.1266" stopColor="#C45E38" />
        <stop offset="0.1305" stopColor="#C35E39" />
        <stop offset="0.1344" stopColor="#C35E39" />
        <stop offset="0.1383" stopColor="#C35F3A" />
        <stop offset="0.1422" stopColor="#C35F3A" />
        <stop offset="0.1461" stopColor="#C35F3A" />
        <stop offset="0.15" stopColor="#C25F3B" />
        <stop offset="0.1539" stopColor="#C25F3B" />
        <stop offset="0.1577" stopColor="#C25F3C" />
        <stop offset="0.1616" stopColor="#C15F3C" />
        <stop offset="0.1655" stopColor="#C15F3C" />
        <stop offset="0.1694" stopColor="#C15F3C" />
        <stop offset="0.1733" stopColor="#C1603D" />
        <stop offset="0.1772" stopColor="#C1603D" />
        <stop offset="0.1811" stopColor="#C0613E" />
        <stop offset="0.185" stopColor="#C0603E" />
        <stop offset="0.1889" stopColor="#C0603E" />
        <stop offset="0.1928" stopColor="#C0613F" />
        <stop offset="0.1966" stopColor="#C0613F" />
        <stop offset="0.2005" stopColor="#C0613F" />
        <stop offset="0.2044" stopColor="#BF613F" />
        <stop offset="0.2083" stopColor="#BF6140" />
        <stop offset="0.2122" stopColor="#BF6141" />
        <stop offset="0.2161" stopColor="#BE6141" />
        <stop offset="0.22" stopColor="#BE6141" />
        <stop offset="0.2239" stopColor="#BE6141" />
        <stop offset="0.2278" stopColor="#BE6242" />
        <stop offset="0.2316" stopColor="#BE6242" />
        <stop offset="0.2355" stopColor="#BD6242" />
        <stop offset="0.2394" stopColor="#BD6243" />
        <stop offset="0.2433" stopColor="#BD6243" />
        <stop offset="0.2472" stopColor="#BD6244" />
        <stop offset="0.2511" stopColor="#BD6244" />
        <stop offset="0.255" stopColor="#BD6244" />
        <stop offset="0.2589" stopColor="#BC6244" />
        <stop offset="0.2628" stopColor="#BC6244" />
        <stop offset="0.2666" stopColor="#BC6346" />
        <stop offset="0.2705" stopColor="#BB6346" />
        <stop offset="0.2744" stopColor="#BB6346" />
        <stop offset="0.2783" stopColor="#BB6347" />
        <stop offset="0.2822" stopColor="#BB6347" />
        <stop offset="0.2861" stopColor="#BB6347" />
        <stop offset="0.29" stopColor="#BA6347" />
        <stop offset="0.2939" stopColor="#BB6448" />
        <stop offset="0.2978" stopColor="#BB6448" />
        <stop offset="0.3016" stopColor="#BA6448" />
        <stop offset="0.3055" stopColor="#BA6448" />
        <stop offset="0.3094" stopColor="#BA6448" />
        <stop offset="0.3133" stopColor="#B9644A" />
        <stop offset="0.3172" stopColor="#B9644A" />
        <stop offset="0.3211" stopColor="#B9644A" />
        <stop offset="0.325" stopColor="#B9654B" />
        <stop offset="0.3289" stopColor="#B9654B" />
        <stop offset="0.3328" stopColor="#B8654B" />
        <stop offset="0.3367" stopColor="#B8654B" />
        <stop offset="0.3405" stopColor="#B8654B" />
        <stop offset="0.3444" stopColor="#B8654D" />
        <stop offset="0.3483" stopColor="#B8654D" />
        <stop offset="0.3522" stopColor="#B8654D" />
        <stop offset="0.3561" stopColor="#B7664E" />
        <stop offset="0.36" stopColor="#B7664E" />
        <stop offset="0.3639" stopColor="#B7664E" />
        <stop offset="0.3678" stopColor="#B6664E" />
        <stop offset="0.3717" stopColor="#B6664E" />
        <stop offset="0.3755" stopColor="#B6664E" />
        <stop offset="0.3794" stopColor="#B6664F" />
        <stop offset="0.3833" stopColor="#B66650" />
        <stop offset="0.3872" stopColor="#B56650" />
        <stop offset="0.3911" stopColor="#B56650" />
        <stop offset="0.395" stopColor="#B56650" />
        <stop offset="0.3989" stopColor="#B56751" />
        <stop offset="0.4028" stopColor="#B56751" />
        <stop offset="0.4067" stopColor="#B56651" />
        <stop offset="0.4105" stopColor="#B46752" />
        <stop offset="0.4144" stopColor="#B46752" />
        <stop offset="0.4183" stopColor="#B46752" />
        <stop offset="0.4222" stopColor="#B46752" />
        <stop offset="0.4261" stopColor="#B46752" />
        <stop offset="0.43" stopColor="#B36853" />
        <stop offset="0.4339" stopColor="#B36753" />
        <stop offset="0.4378" stopColor="#B36753" />
        <stop offset="0.4417" stopColor="#B36754" />
        <stop offset="0.4455" stopColor="#B36754" />
        <stop offset="0.4494" stopColor="#B36754" />
        <stop offset="0.4533" stopColor="#B26855" />
        <stop offset="0.4572" stopColor="#B26855" />
        <stop offset="0.4611" stopColor="#B26755" />
        <stop offset="0.465" stopColor="#B26856" />
        <stop offset="0.4689" stopColor="#B26856" />
        <stop offset="0.4728" stopColor="#B26856" />
        <stop offset="0.4767" stopColor="#B16856" />
        <stop offset="0.4805" stopColor="#B16856" />
        <stop offset="0.4844" stopColor="#B16957" />
        <stop offset="0.4883" stopColor="#B16857" />
        <stop offset="0.4922" stopColor="#B16857" />
        <stop offset="0.4961" stopColor="#B06857" />
        <stop offset="0.5" stopColor="#B06857" />
        <stop offset="0.5039" stopColor="#B06858" />
        <stop offset="0.5078" stopColor="#B06959" />
        <stop offset="0.5117" stopColor="#B06959" />
        <stop offset="0.5156" stopColor="#B06859" />
        <stop offset="0.5195" stopColor="#AF695A" />
        <stop offset="0.5233" stopColor="#AF695A" />
        <stop offset="0.5272" stopColor="#AF695A" />
        <stop offset="0.5311" stopColor="#AF695A" />
        <stop offset="0.535" stopColor="#AF695A" />
        <stop offset="0.5389" stopColor="#AE695A" />
        <stop offset="0.5428" stopColor="#AE695B" />
        <stop offset="0.5467" stopColor="#AE695B" />
        <stop offset="0.5506" stopColor="#AE695B" />
        <stop offset="0.5544" stopColor="#AE695B" />
        <stop offset="0.5583" stopColor="#AE695B" />
        <stop offset="0.5622" stopColor="#AD6A5D" />
        <stop offset="0.5661" stopColor="#AD6A5D" />
        <stop offset="0.57" stopColor="#AD6A5D" />
        <stop offset="0.5739" stopColor="#AD6A5D" />
        <stop offset="0.5778" stopColor="#AD6A5D" />
        <stop offset="0.5817" stopColor="#AC6B5E" />
        <stop offset="0.5856" stopColor="#AC6B5E" />
        <stop offset="0.5895" stopColor="#AC6B5E" />
        <stop offset="0.5933" stopColor="#AC6B5E" />
        <stop offset="0.5972" stopColor="#AC6B5F" />
        <stop offset="0.6011" stopColor="#AC6B5F" />
        <stop offset="0.605" stopColor="#AB6B5F" />
        <stop offset="0.6089" stopColor="#AB6B5F" />
        <stop offset="0.6128" stopColor="#AB6B5F" />
        <stop offset="0.6167" stopColor="#AB6B5F" />
        <stop offset="0.6206" stopColor="#AB6B5F" />
        <stop offset="0.6245" stopColor="#AB6B60" />
        <stop offset="0.6284" stopColor="#AA6B60" />
        <stop offset="0.6322" stopColor="#AA6B60" />
        <stop offset="0.6361" stopColor="#AA6B60" />
        <stop offset="0.64" stopColor="#AA6B60" />
        <stop offset="0.6439" stopColor="#AA6B60" />
        <stop offset="0.6478" stopColor="#AA6C62" />
        <stop offset="0.6517" stopColor="#AA6C62" />
        <stop offset="0.6556" stopColor="#AA6B62" />
        <stop offset="0.6595" stopColor="#A96B62" />
        <stop offset="0.6633" stopColor="#A96B62" />
        <stop offset="0.6672" stopColor="#A96B62" />
        <stop offset="0.6711" stopColor="#A96C63" />
        <stop offset="0.675" stopColor="#A96C63" />
        <stop offset="0.6789" stopColor="#A86C63" />
        <stop offset="0.6828" stopColor="#A86C64" />
        <stop offset="0.6867" stopColor="#A86C64" />
        <stop offset="0.6906" stopColor="#A86C64" />
        <stop offset="0.6945" stopColor="#A86C64" />
        <stop offset="0.6984" stopColor="#A86C64" />
        <stop offset="0.7022" stopColor="#A76C64" />
        <stop offset="0.7061" stopColor="#A76C64" />
        <stop offset="0.71" stopColor="#A86D65" />
        <stop offset="0.7139" stopColor="#A76D65" />
        <stop offset="0.7178" stopColor="#A76D65" />
        <stop offset="0.7217" stopColor="#A76D65" />
        <stop offset="0.7256" stopColor="#A66D65" />
        <stop offset="0.7295" stopColor="#A66D65" />
        <stop offset="0.7334" stopColor="#A56D65" />
        <stop offset="0.7372" stopColor="#A66D67" />
        <stop offset="0.7411" stopColor="#A66D67" />
        <stop offset="0.745" stopColor="#A56D67" />
        <stop offset="0.7489" stopColor="#A56D67" />
        <stop offset="0.7528" stopColor="#A56D67" />
        <stop offset="0.7567" stopColor="#A46D67" />
        <stop offset="0.7606" stopColor="#A46D67" />
        <stop offset="0.7645" stopColor="#A56D68" />
        <stop offset="0.7684" stopColor="#A46D68" />
        <stop offset="0.7722" stopColor="#A46D68" />
        <stop offset="0.7761" stopColor="#A46D68" />
        <stop offset="0.78" stopColor="#A46D68" />
        <stop offset="0.7839" stopColor="#A46D68" />
        <stop offset="0.7878" stopColor="#A46E69" />
        <stop offset="0.7917" stopColor="#A46E69" />
        <stop offset="0.7956" stopColor="#A46E6A" />
        <stop offset="0.7995" stopColor="#A36E6A" />
        <stop offset="0.8034" stopColor="#A36E6A" />
        <stop offset="0.8073" stopColor="#A36E6A" />
        <stop offset="0.8111" stopColor="#A36F6B" />
        <stop offset="0.815" stopColor="#A36F6B" />
        <stop offset="0.8189" stopColor="#A36E6B" />
        <stop offset="0.8228" stopColor="#A26E6B" />
        <stop offset="0.8267" stopColor="#A26E6B" />
        <stop offset="0.8306" stopColor="#A26F6C" />
        <stop offset="0.8345" stopColor="#A26F6C" />
        <stop offset="0.8384" stopColor="#A26F6C" />
        <stop offset="0.8422" stopColor="#A16F6C" />
        <stop offset="0.8461" stopColor="#A16E6C" />
        <stop offset="0.85" stopColor="#A16E6C" />
        <stop offset="0.8539" stopColor="#A16F6E" />
        <stop offset="0.8578" stopColor="#A16F6E" />
        <stop offset="0.8617" stopColor="#A16F6E" />
        <stop offset="0.8656" stopColor="#A16F6E" />
        <stop offset="0.8695" stopColor="#A16F6E" />
        <stop offset="0.8734" stopColor="#A1706F" />
        <stop offset="0.8773" stopColor="#A1706F" />
        <stop offset="0.8812" stopColor="#A1706F" />
        <stop offset="0.885" stopColor="#A0706F" />
        <stop offset="0.8889" stopColor="#A0706F" />
        <stop offset="0.8928" stopColor="#A0706F" />
        <stop offset="0.8967" stopColor="#9F706F" />
        <stop offset="0.9006" stopColor="#9F706F" />
        <stop offset="0.9045" stopColor="#9F6F6F" />
        <stop offset="0.9084" stopColor="#9F7070" />
        <stop offset="0.9123" stopColor="#9F7071" />
        <stop offset="0.9161" stopColor="#9F7071" />
        <stop offset="0.92" stopColor="#9E7071" />
        <stop offset="0.9239" stopColor="#9E7071" />
        <stop offset="0.9278" stopColor="#9E7071" />
        <stop offset="0.9317" stopColor="#9E7072" />
        <stop offset="0.9356" stopColor="#9E7072" />
        <stop offset="0.9395" stopColor="#9E7072" />
        <stop offset="0.9434" stopColor="#9E7072" />
        <stop offset="0.9473" stopColor="#9E7072" />
        <stop offset="0.9512" stopColor="#9D7072" />
        <stop offset="0.955" stopColor="#9D7072" />
        <stop offset="0.9589" stopColor="#9D6F72" />
        <stop offset="0.9628" stopColor="#9D7173" />
        <stop offset="0.9667" stopColor="#9D7173" />
        <stop offset="0.9706" stopColor="#9D7173" />
        <stop offset="0.9745" stopColor="#9C7173" />
        <stop offset="0.9784" stopColor="#9C7173" />
        <stop offset="0.9823" stopColor="#9C7173" />
        <stop offset="0.9862" stopColor="#9C7174" />
        <stop offset="1" stopColor="#9C7174" />
      </linearGradient>
      <path
        fill={`url(#${id}-SVGID_1_)`}
        d="M37.55,126.98c-5.14,10.27-3.5,24.97,7.35,35.61c12.34,12.11,31.63,19.4,57.89,19.4  c26.35,0,45.63-7.52,57.43-19.4c11.59-11.65,12.02-26.81,7.29-35.96c-1.92-3.7-4.51-7.12-8.04-10.36c2.64,2.69,4.79,5.63,6.38,8.72  c0.06,0.11,0.11,0.26,0.17,0.37c0.23,0.46,0.46,0.95,0.66,1.43c0.98,2.27,1.63,4.59,1.95,6.95c0.72,5.22-0.23,10.36-2.9,15.41  c-1.64,3.07-3.9,6.11-6.86,9.01c-12.02,11.79-32.52,19.06-56.28,19.06c-22.33,0-41.73-6.4-53.99-16.93l0,0  c-0.8-0.69-1.58-1.41-2.3-2.12c-10.5-10.31-12.43-22.1-7.18-32.81c0.11-0.23,0.23-0.46,0.34-0.69c1.61-3.04,3.76-5.91,6.34-8.55  c0.03-0.03,0.08-0.08,0.11-0.12C42.61,119.28,39.96,122.15,37.55,126.98"
      />
      <path
        fill="#F36717"
        d="M139.89,103.64c-11.14-4.62-24.11-7-37.28-7c-13.17,0-26.15,2.38-37.28,7  c-12.2,5.05-21.64,12.57-26.15,21.73c-5.25,10.7-3.33,22.5,7.18,32.8c12.03,11.8,32.52,19.06,56.28,19.06  c23.76,0,44.26-7.26,56.28-19.06c10.5-10.3,12.43-22.1,7.15-32.8C161.5,116.21,152.09,108.7,139.89,103.64"
      />
      <linearGradient
        id={`${id}-SVGID_2_`}
        gradientUnits="userSpaceOnUse"
        x1="-555.066"
        y1="256.1931"
        x2="-552.5981"
        y2="256.1931"
        gradientTransform="matrix(45.2844 -7.9848 -7.9848 -45.2844 27205.0078 7306.6411)"
      >
        <stop offset="0" stopColor="#FDDB63" />
        <stop offset="3.460000e-03" stopColor="#FDDB63" />
        <stop offset="0.0112" stopColor="#FDDA62" />
        <stop offset="0.019" stopColor="#FDD962" />
        <stop offset="0.0267" stopColor="#FDD861" />
        <stop offset="0.0345" stopColor="#FDD761" />
        <stop offset="0.0422" stopColor="#FDD660" />
        <stop offset="0.05" stopColor="#FDD65F" />
        <stop offset="0.0578" stopColor="#FCD55F" />
        <stop offset="0.0655" stopColor="#FCD45E" />
        <stop offset="0.0733" stopColor="#FCD35E" />
        <stop offset="0.081" stopColor="#FCD25D" />
        <stop offset="0.0888" stopColor="#FCD15C" />
        <stop offset="0.0966" stopColor="#FCD05C" />
        <stop offset="0.1043" stopColor="#FCCF5B" />
        <stop offset="0.1121" stopColor="#FCCE5B" />
        <stop offset="0.1198" stopColor="#FCCD5A" />
        <stop offset="0.1276" stopColor="#FCCC5A" />
        <stop offset="0.1354" stopColor="#FCCC59" />
        <stop offset="0.1431" stopColor="#FCCB58" />
        <stop offset="0.1509" stopColor="#FCCA58" />
        <stop offset="0.1586" stopColor="#FBC957" />
        <stop offset="0.1664" stopColor="#FBC857" />
        <stop offset="0.1741" stopColor="#FBC756" />
        <stop offset="0.1819" stopColor="#FBC655" />
        <stop offset="0.1897" stopColor="#FBC555" />
        <stop offset="0.1974" stopColor="#FBC454" />
        <stop offset="0.2052" stopColor="#FBC354" />
        <stop offset="0.2129" stopColor="#FBC353" />
        <stop offset="0.2207" stopColor="#FBC252" />
        <stop offset="0.2285" stopColor="#FBC152" />
        <stop offset="0.2362" stopColor="#FBC051" />
        <stop offset="0.244" stopColor="#FBBF51" />
        <stop offset="0.2517" stopColor="#FBBE50" />
        <stop offset="0.2595" stopColor="#FABD4F" />
        <stop offset="0.2672" stopColor="#FABC4F" />
        <stop offset="0.275" stopColor="#FABB4E" />
        <stop offset="0.2828" stopColor="#FABA4E" />
        <stop offset="0.2905" stopColor="#FAB94D" />
        <stop offset="0.2983" stopColor="#FAB94C" />
        <stop offset="0.306" stopColor="#FAB84C" />
        <stop offset="0.3138" stopColor="#FAB74B" />
        <stop offset="0.3216" stopColor="#FAB64B" />
        <stop offset="0.3293" stopColor="#FAB54A" />
        <stop offset="0.3371" stopColor="#FAB449" />
        <stop offset="0.3448" stopColor="#FAB349" />
        <stop offset="0.3526" stopColor="#F9B248" />
        <stop offset="0.3604" stopColor="#F9B148" />
        <stop offset="0.3681" stopColor="#F9B047" />
        <stop offset="0.3759" stopColor="#F9AF47" />
        <stop offset="0.3836" stopColor="#F9AF46" />
        <stop offset="0.3914" stopColor="#F9AE45" />
        <stop offset="0.3991" stopColor="#F9AD45" />
        <stop offset="0.4069" stopColor="#F9AC44" />
        <stop offset="0.4147" stopColor="#F9AB44" />
        <stop offset="0.4224" stopColor="#F9AA43" />
        <stop offset="0.4302" stopColor="#F9A942" />
        <stop offset="0.4379" stopColor="#F9A842" />
        <stop offset="0.4457" stopColor="#F9A741" />
        <stop offset="0.4535" stopColor="#F8A641" />
        <stop offset="0.4612" stopColor="#F8A640" />
        <stop offset="0.469" stopColor="#F8A53F" />
        <stop offset="0.4767" stopColor="#F8A43F" />
        <stop offset="0.4845" stopColor="#F8A33E" />
        <stop offset="0.4922" stopColor="#F8A23E" />
        <stop offset="0.5" stopColor="#F8A13D" />
        <stop offset="0.5078" stopColor="#F8A03C" />
        <stop offset="0.5155" stopColor="#F89F3C" />
        <stop offset="0.5233" stopColor="#F89E3B" />
        <stop offset="0.531" stopColor="#F89D3B" />
        <stop offset="0.5388" stopColor="#F89C3A" />
        <stop offset="0.5465" stopColor="#F89C39" />
        <stop offset="0.5543" stopColor="#F79B39" />
        <stop offset="0.5621" stopColor="#F79A38" />
        <stop offset="0.5698" stopColor="#F79938" />
        <stop offset="0.5776" stopColor="#F79837" />
        <stop offset="0.5853" stopColor="#F79736" />
        <stop offset="0.5931" stopColor="#F79636" />
        <stop offset="0.6009" stopColor="#F79535" />
        <stop offset="0.6086" stopColor="#F79435" />
        <stop offset="0.6164" stopColor="#F79334" />
        <stop offset="0.6241" stopColor="#F79234" />
        <stop offset="0.6319" stopColor="#F79233" />
        <stop offset="0.6396" stopColor="#F79132" />
        <stop offset="0.6474" stopColor="#F79032" />
        <stop offset="0.6552" stopColor="#F68F31" />
        <stop offset="0.6629" stopColor="#F68E31" />
        <stop offset="0.6707" stopColor="#F68D30" />
        <stop offset="0.6784" stopColor="#F68C2F" />
        <stop offset="0.6862" stopColor="#F68B2F" />
        <stop offset="0.694" stopColor="#F68A2E" />
        <stop offset="0.7017" stopColor="#F6892E" />
        <stop offset="0.7095" stopColor="#F6892D" />
        <stop offset="0.7172" stopColor="#F6882C" />
        <stop offset="0.725" stopColor="#F6872C" />
        <stop offset="0.7328" stopColor="#F6862B" />
        <stop offset="0.7405" stopColor="#F6852B" />
        <stop offset="0.7483" stopColor="#F5842A" />
        <stop offset="0.756" stopColor="#F58329" />
        <stop offset="0.7638" stopColor="#F58229" />
        <stop offset="0.7715" stopColor="#F58128" />
        <stop offset="0.7793" stopColor="#F58028" />
        <stop offset="0.7871" stopColor="#F57F27" />
        <stop offset="0.7948" stopColor="#F57F26" />
        <stop offset="0.8026" stopColor="#F57E26" />
        <stop offset="0.8103" stopColor="#F57D25" />
        <stop offset="0.8181" stopColor="#F57C25" />
        <stop offset="0.8259" stopColor="#F57B24" />
        <stop offset="0.8336" stopColor="#F57A23" />
        <stop offset="0.8414" stopColor="#F57923" />
        <stop offset="0.8491" stopColor="#F47822" />
        <stop offset="0.8569" stopColor="#F47722" />
        <stop offset="0.8647" stopColor="#F47621" />
        <stop offset="0.8724" stopColor="#F47521" />
        <stop offset="0.8802" stopColor="#F47520" />
        <stop offset="0.8879" stopColor="#F4741F" />
        <stop offset="0.8957" stopColor="#F4731F" />
        <stop offset="0.9034" stopColor="#F4721E" />
        <stop offset="0.9112" stopColor="#F4711E" />
        <stop offset="0.919" stopColor="#F4701D" />
        <stop offset="0.9267" stopColor="#F46F1C" />
        <stop offset="0.9345" stopColor="#F46E1C" />
        <stop offset="0.9422" stopColor="#F46D1B" />
        <stop offset="0.95" stopColor="#F36C1B" />
        <stop offset="0.9578" stopColor="#F36C1A" />
        <stop offset="0.9655" stopColor="#F36B19" />
        <stop offset="0.9733" stopColor="#F36A19" />
        <stop offset="0.981" stopColor="#F36918" />
        <stop offset="0.9888" stopColor="#F36818" />
        <stop offset="0.9965" stopColor="#F36717" />
        <stop offset="1" stopColor="#F36717" />
      </linearGradient>
      <path
        fill={`url(#${id}-SVGID_2_)`}
        d="M104.91,126.69c0,0-1.06,0.29-2.24,0.6c0.08,2.76,0.17,5.57,0.26,8.38c1.86-2.9,3.18-5.91,3.96-9.01  c-0.26-0.03-0.55-0.03-0.8-0.03C105.69,126.63,105.28,126.66,104.91,126.69 M102.59,124.91c0,0.34,0.03,0.69,0.03,1.03  c0.32-0.46,0.63-0.86,0.95-1.24c-0.11-0.06-0.23-0.11-0.34-0.17C103.02,124.68,102.82,124.79,102.59,124.91 M102.59,124.19  c-12.46,0.2-22.3,0.78-34.55,1.81c10.76,0.03,19.11,0.43,30.05,1.29c-7.78,4.79-15.38,9.9-22.79,15.24  c7.69-4.34,15.53-8.44,23.48-12.26c-0.2-0.89-0.4-1.78-0.6-2.67l-0.06-0.32c1.49-0.92,3.01-1.84,4.5-2.76  C102.59,124.42,102.59,124.31,102.59,124.19C102.59,124.16,102.59,124.16,102.59,124.19C102.59,124.16,102.59,124.16,102.59,124.19   M102.59,124.19c0.11,0.06,0.2,0.11,0.31,0.18c-0.11,0.06-0.23,0.14-0.31,0.2c0.06-0.03,0.08-0.06,0.14-0.09l0.2-0.11  c0.11-0.06,0.23-0.15,0.34-0.2C103.02,124.16,102.82,124.16,102.59,124.19 M103.25,124.16L103.25,124.16 M103.25,124.16  c0.29,0,0.55,0,0.83,0c0.34-0.37,0.69-0.75,1.09-1.12C104.51,123.42,103.88,123.79,103.25,124.16 M107.53,118.68  c0,0.03,0.03,0.08,0.03,0.11C107.55,118.77,107.55,118.71,107.53,118.68L107.53,118.68 M93.49,121.78c1.55-0.17,3.13-0.34,4.68-0.49  c-6.28-3.5-12.71-6.77-19.29-9.67C83.91,114.78,88.75,118.19,93.49,121.78 M98.17,121.29c1.66,0.92,3.33,1.86,4.99,2.84  c0.03,0.03,0.06,0.03,0.08,0.06c0-6.14,0-12.28,0-18.46C101.38,110.85,99.72,116.07,98.17,121.29 M103.16,102.61L103.16,102.61  c-16.88,0-43.88,5.77-48.13,25.23c-0.72,3.27-0.66,6.26,0,8.98c2.41,8.61,10.99,14.52,20.78,18.25  c10.31-3.64,18.34-8.92,23.76-15.04c-0.54-2.44-1.09-4.88-1.66-7.35c-9.99,4.71-19.06,9.21-28.96,14.46  c7-6.95,13.63-12.94,21.15-19.31c-10.68-0.69-20.89-0.83-31.8-0.98c10.7-2.33,21.3-4.13,32.17-5.51  c-5.11-4.02-10.11-7.75-15.59-11.25l0,0l-0.83-0.52c8.24,2.09,16.05,4.59,24.02,7.52c1.58-4.71,3.24-9.39,5.14-13.98  C103.19,102.95,103.19,102.78,103.16,102.61z M65.31,103.64c-11.88,4.94-21.15,12.17-25.8,21.04c-0.11,0.23-0.23,0.46-0.34,0.69  c-5.28,10.7-3.33,22.5,7.18,32.8c0.75,0.72,1.49,1.44,2.3,2.12c8.9-0.52,16.96-1.98,24.02-4.16c-9.44-4.02-17.42-10.1-19.49-18.74  c-0.83-3.01-0.95-6.37-0.11-10.05c4.5-20.12,32.43-26.12,49.94-26.12c0.03,0,0.08,0,0.11,0c0-1.61,0.17-3.16,0.37-4.59  c-0.31,0-0.6,0-0.92,0C89.42,96.64,76.44,99.02,65.31,103.64"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#FFFFFF"
        d="M74.07,109.56c8.24,2.09,16.04,4.59,24.02,7.52  c1.58-4.74,3.24-9.44,5.17-14.03c1.92,4.62,3.59,9.3,5.17,14.03c7.95-2.93,15.64-5.34,23.88-7.4c-5.8,3.64-10.91,7.38-16.27,11.59  c10.88,1.38,21.07,3.19,31.77,5.51c-10.68-0.23-20.75,0.14-31.4,0.83c7.52,6.37,13.95,12.54,20.95,19.49  c-9.59-5.48-18.57-10.07-28.56-14.78c-1.92,8.35-3.76,16.73-5.54,25.11c-1.75-8.38-3.39-16.36-5.31-24.71  c-9.99,4.71-19.06,9.21-28.96,14.46c7-6.95,13.63-12.94,21.15-19.31c-10.68-0.69-20.89-0.83-31.8-0.98  c10.71-2.32,21.3-4.13,32.17-5.51C85.12,117.11,79.84,113.21,74.07,109.56 M103.26,124.17c0-6.14,0-12.28,0-18.45  c-1.87,5.14-3.53,10.33-5.08,15.56C99.88,122.22,101.57,123.2,103.26,124.17 M78.87,111.6c6.6,2.9,13,6.17,19.29,9.67  c-1.55,0.14-3.13,0.32-4.68,0.49C88.74,118.2,83.89,114.79,78.87,111.6 M103.26,124.17c12.71,0.03,25.4,0.66,38.03,1.92  c-11.11-2.01-21.87-3.53-32.98-4.82C106.59,122.22,104.93,123.17,103.26,124.17 M127.6,111.6c-6.6,2.9-13.03,6.17-19.31,9.67  c-0.26-0.86-0.52-1.72-0.77-2.58C114.11,116.05,120.83,113.67,127.6,111.6 M102.57,124.17c0.26,8.9,0.6,18.37,0.66,26.98  c1.66-7.98,3.39-15.93,5.22-23.88C106.73,126.21,104.32,125.18,102.57,124.17 M131.24,142.54c-7.4-5.34-14.98-10.45-22.76-15.27  c1.58-0.11,3.19-0.26,4.76-0.34C119.42,131.92,125.42,137.14,131.24,142.54 M103.26,124.17c-12.77,0.17-22.76,0.75-35.21,1.84  c10.76,0.03,19.11,0.43,30.05,1.29C99.79,126.24,101.51,125.2,103.26,124.17 M75.28,142.54c7.43-5.34,15.01-10.45,22.79-15.24  c0.23,1,0.46,1.98,0.69,2.98C90.78,134.1,82.97,138.21,75.28,142.54 M104.5,174.81c0-3.47,0-6.92-0.03-10.36  c-0.37-0.26-0.86-0.52-1.23-0.78c-0.37,0.26-0.92,0.52-1.29,0.78c0,3.44,0,6.92,0,10.36c0.4,0.26,0.92,0.55,1.29,0.83  C103.61,175.38,104.13,175.09,104.5,174.81 M42.99,149.74c-0.2,0.37-0.4,0.77-0.6,1.18c0.37,0.14,1.12,0.37,1.44,0.52  c3.62-1.92,7.2-3.87,10.76-5.74c0.14-0.55,0.23-0.86,0.37-1.26c-0.37-0.09-0.75-0.2-1.09-0.29  C50.22,145.96,46.6,147.82,42.99,149.74 M40.32,128.47c-0.34,0.26-0.66,0.52-1,0.8l0.55,0.75c3.39-0.49,6.77-0.89,10.16-1.23  c0.32-0.32,0.69-0.66,1-0.95l-0.6-0.6C47.06,127.58,43.7,127.98,40.32,128.47 M53.33,111.32c-0.34,0.14-0.69,0.29-1.03,0.43  l0.09,0.77c2.5,0.34,4.99,0.77,7.46,1.26c0.32-0.2,0.75-0.46,1.06-0.6l-0.14-0.66C58.3,112.07,55.8,111.67,53.33,111.32   M129.53,100.74c-1.32,0.83-2.61,1.69-3.9,2.53l0.37,0.43c0.34,0,0.66,0,1,0c1.26-0.89,2.53-1.75,3.85-2.58l-0.37-0.37  C130.16,100.74,129.84,100.74,129.53,100.74 M102.35,97.14c0,1.03,0,2.04-0.03,3.04l0.75,0.26l0.75-0.26c0-1-0.03-2.04-0.03-3.04  l-0.72-0.23L102.35,97.14 M75.07,101.2c1.32,0.83,2.58,1.69,3.85,2.61c0.32,0,0.8-0.09,1.12-0.09l0.37-0.43  c-1.26-0.89-2.55-1.72-3.87-2.55c-0.32,0-0.63,0-0.95,0L75.07,101.2 M67.12,168.48c2.53-3.04,5.11-6.06,7.66-9.04  c-0.14-0.29-0.37-0.8-0.49-1.12c-0.52,0.09-1.15,0.2-1.66,0.32c-2.61,2.98-5.17,6-7.69,9.01c0.11,0.37,0.37,0.72,0.49,1.09  C65.94,168.59,66.6,168.59,67.12,168.48 M162.65,149.74c-3.59-1.92-7.23-3.79-10.88-5.6c-0.34,0.09-0.72,0.2-1.09,0.29  c0.14,0.4,0.23,0.72,0.37,1.26c3.56,1.87,7.15,3.82,10.76,5.74c0.32-0.14,1.06-0.37,1.44-0.52  C163.05,150.52,162.85,150.12,162.65,149.74 M165.32,128.47c-3.36-0.49-6.74-0.89-10.1-1.23l-0.6,0.6c0.32,0.29,0.69,0.63,1,0.95  c3.39,0.34,6.77,0.75,10.16,1.23l0.55-0.75C165.98,128.98,165.66,128.72,165.32,128.47 M152.34,111.32  c-2.5,0.34-4.99,0.75-7.49,1.21l-0.11,0.66c0.32,0.14,0.75,0.4,1.06,0.6c2.47-0.49,4.97-0.92,7.46-1.26l0.11-0.77  C153.02,111.61,152.68,111.47,152.34,111.32 M138.52,168.48c0.43,0.06,1.18,0.17,1.69,0.26c0.17-0.34,0.32-0.72,0.49-1.09  c-2.53-3.01-5.08-6.03-7.69-9.01c-0.52-0.11-1.15-0.23-1.66-0.32c-0.11,0.32-0.34,0.83-0.49,1.12  C133.44,162.42,135.99,165.44,138.52,168.48"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#D24F54"
        d="M102.99,124.32l0.26-0.17v0.37c-1.72,1.03-3.42,2.04-5.11,3.07  l-0.06-0.32c1.55-0.95,3.1-1.89,4.65-2.81L102.99,124.32 M108.3,121.27c-0.26-0.86-0.52-1.72-0.77-2.58V119  c0.23,0.78,0.46,1.55,0.69,2.32L108.3,121.27"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#D34D53"
        d="M103.25,103.36c1.92,4.62,3.59,9.3,5.17,14.03  c7.69-2.84,15.1-5.14,23.05-7.2l0.83-0.52c-8.24,2.1-15.9,4.48-23.88,7.4c-1.58-4.74-3.24-9.41-5.17-14.03  c-1.92,4.62-3.59,9.3-5.17,14.03c-7.95-2.93-15.78-5.42-24.02-7.52l0.83,0.52c7.95,2.07,15.5,4.48,23.19,7.32  C99.66,112.65,101.32,107.98,103.25,103.36"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#CB582A"
        d="M42.95,150.34l-0.34,0.63l-0.23-0.09c0.2-0.4,0.4-0.77,0.6-1.18  c3.62-1.92,7.23-3.79,10.88-5.6c0.37,0.09,0.72,0.2,1.09,0.29l-0.2,0.63c-0.29-0.09-0.69-0.14-0.98-0.23  C50.13,146.61,46.57,148.42,42.95,150.34 M40.45,128.94c3.36-0.49,6.66-0.89,10.07-1.26l0.34,0.34l0.2-0.2l-0.6-0.6  c-3.39,0.34-6.74,0.78-10.13,1.26c-0.32,0.29-0.66,0.55-0.98,0.8l0.23,0.32L40.45,128.94 M53.38,111.92  c2.47,0.34,7.52,1.35,7.58,1.32l-0.14-0.66c-2.5-0.49-4.97-0.89-7.46-1.23c-0.34,0.14-0.69,0.29-1.03,0.43l0.06,0.52L53.38,111.92z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#C05D61"
        d="M108.45,127.27c7.81,4.79,15.38,9.93,22.76,15.27V143  c-9.76-7.03-17.48-12.08-22.79-15.35c-1.84,7.95-3.53,15.84-5.19,23.82v-0.32C104.87,143.26,106.65,135.1,108.45,127.27   M116.72,127.9l-0.34-0.29v0.49c7.26,6.14,13.06,11.65,19.8,18.34l1.15,0.66C130.23,140.04,123.89,133.98,116.72,127.9   M115.99,121.28v0.37c10.33,1.32,19.8,2.96,29.99,5.11c0.52,0,1.26,0.03,1.78,0.03C137.06,124.47,126.87,122.66,115.99,121.28   M103.25,124.15h0.52H103.25l0.26,0.17l0.32,0.17c12.54,0.03,25,0.66,37.45,1.92v-0.34C128.65,124.81,115.96,124.18,103.25,124.15   M108.3,121.27l0.46,0.06c6.14-3.39,12.43-6.57,18.86-9.41v-0.32C121.01,114.5,114.58,117.77,108.3,121.27 M130.48,101.28l0.06,0.06  l0.32-0.2l-0.37-0.37c-0.32,0-0.63,0-0.95,0c-1.32,0.83-2.61,1.66-3.87,2.55l0.29,0.32c1.18-0.8,2.38-1.61,3.59-2.35  C129.85,101.28,130.16,101.28,130.48,101.28 M74.24,158.75l0.46,0.86l0.14-0.14c-0.06-0.14-0.34-0.83-0.49-1.12  c-0.52,0.11-1.15,0.23-1.66,0.32c-2.58,2.98-5.17,5.97-7.69,9.01l0.2,0.43c1.64-1.92,5.14-6.14,7.69-9.07  C73.26,158.89,73.81,158.84,74.24,158.75 M162.71,150.34l0.34,0.63l0.23-0.09c-0.2-0.4-0.4-0.77-0.6-1.18  c-3.62-1.92-7.23-3.79-10.88-5.6c-0.37,0.09-0.75,0.2-1.09,0.29l0.2,0.63l0.98-0.23C155.51,146.61,159.09,148.42,162.71,150.34   M165.22,128.94l0.86,0.66l0.23-0.32c-0.32-0.26-0.66-0.52-0.98-0.8c-3.39-0.49-6.74-0.92-10.13-1.26l-0.6,0.6l0.2,0.2l0.34-0.34  C158.53,128.05,161.83,128.45,165.22,128.94 M153.29,112.29l0.06-0.52c-0.34-0.14-0.69-0.29-1.03-0.43  c-2.5,0.34-4.99,0.75-7.46,1.23l-0.14,0.66c0.06,0.03,5.11-0.98,7.58-1.32L153.29,112.29z M131.43,158.75  c0.4,0.09,0.98,0.14,1.35,0.32c2.55,2.93,6.08,7.12,7.72,9.04l0.17-0.43c-2.53-3.04-5.11-6.03-7.69-9.01  c-0.52-0.09-1.15-0.2-1.66-0.32c-0.14,0.29-0.43,0.98-0.49,1.12l0.14,0.14L131.43,158.75 M104.26,164.82l0.23,9.99l-0.03-10.36  c-0.37-0.26-0.86-0.52-1.23-0.77c-0.37,0.26-0.92,0.52-1.29,0.77v10.36l0.23-9.99c0.32-0.2,0.75-0.4,1.03-0.6L104.26,164.82z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#CF543E"
        d="M90.09,128.3c-7.29,6.14-13.26,11.54-20.03,18.22l-1.09,0.63  c6.89-6.83,13.72-13.03,21.12-19.31V128.3z M98.17,121.29l-0.49,0.06c-1.41,0.14-2.81,0.29-4.22,0.46c-4.74-3.59-9.59-7-14.61-10.19  v0.37c5.02,3.19,9.87,6.6,14.61,10.19c1.55-0.17,3.13-0.34,4.68-0.49c1.52,0.83,2.96,1.64,4.48,2.53h0.6  C101.58,123.21,99.83,122.21,98.17,121.29 M75.28,142.98c7.69-4.33,15.53-8.44,23.48-12.25v-0.43c-7.98,3.82-15.79,7.92-23.48,12.25  V142.98z M90.13,121.38c-10.76,1.38-21.24,3.19-31.83,5.45c0.52,0,1.15,0.03,1.69,0.03c10.19-2.15,20.15-3.85,30.48-5.17v-0.37  L90.13,121.38z M98.08,127.29c-10.02-0.86-19.98-1.35-30.02-1.29v0.32c9.9-0.09,19.75,0.4,29.62,1.26L98.08,127.29 M76.57,101.18  c1.21,0.75,2.38,1.61,3.56,2.41l0.29-0.32c-1.26-0.89-2.55-1.75-3.87-2.55c-0.32,0-0.63,0-0.95,0l-0.52,0.46l0.32,0.2l0.23-0.2  C75.94,101.18,76.25,101.18,76.57,101.18 M53.05,127.37c-5.6,25.05,31.83,34.41,49.97,34.41s55.56-9.36,49.94-34.41  c-4.53-20.12-32.46-26.12-49.97-26.12C85.48,101.25,57.55,107.22,53.05,127.37 M54.88,127.23c-5.25,24.08,30.68,32.98,48.13,32.98  c17.45,0,53.38-8.9,48.13-32.98C146.9,107.77,119.89,102,103.01,102C86.14,102,59.13,107.77,54.88,127.23"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#FFFFFF"
        d="M53.22,128c4.51-20.15,31.28-26.23,49.94-26.23  c18.63,0,45.43,6.08,49.94,26.23c5.63,25.05-31.8,34.38-49.94,34.38C85.02,162.38,47.59,153.05,53.22,128 M55.05,127.85  c4.25-19.46,31.25-25.23,48.13-25.23c16.85,0,43.88,5.77,48.13,25.23c5.25,24.08-30.68,32.98-48.13,32.98S49.8,151.9,55.05,127.85"
      />
      <linearGradient
        id={`${id}-SVGID_3_`}
        gradientUnits="userSpaceOnUse"
        x1="-555.066"
        y1="256.1569"
        x2="-552.5981"
        y2="256.1569"
        gradientTransform="matrix(45.2844 -7.9848 -7.9848 -45.2844 27205.0078 7306.6411)"
      >
        <stop offset="0" stopColor="#9C735F" />
        <stop offset="3.460000e-03" stopColor="#9C735F" />
        <stop offset="0.0112" stopColor="#9C735F" />
        <stop offset="0.019" stopColor="#9C725F" />
        <stop offset="0.0267" stopColor="#9C725F" />
        <stop offset="0.0345" stopColor="#9D7260" />
        <stop offset="0.0422" stopColor="#9D7260" />
        <stop offset="0.05" stopColor="#9D725F" />
        <stop offset="0.0578" stopColor="#9D7260" />
        <stop offset="0.0655" stopColor="#9D7260" />
        <stop offset="0.0733" stopColor="#9D7260" />
        <stop offset="0.081" stopColor="#9E7260" />
        <stop offset="0.0888" stopColor="#9E7260" />
        <stop offset="0.0966" stopColor="#9E7160" />
        <stop offset="0.1043" stopColor="#9E7160" />
        <stop offset="0.1121" stopColor="#9E715F" />
        <stop offset="0.1198" stopColor="#9F7160" />
        <stop offset="0.1276" stopColor="#9F7160" />
        <stop offset="0.1354" stopColor="#9F715F" />
        <stop offset="0.1431" stopColor="#9F7160" />
        <stop offset="0.1509" stopColor="#9F7160" />
        <stop offset="0.1586" stopColor="#9F7060" />
        <stop offset="0.1664" stopColor="#A07160" />
        <stop offset="0.1741" stopColor="#A0705F" />
        <stop offset="0.1819" stopColor="#A17060" />
        <stop offset="0.1897" stopColor="#A17060" />
        <stop offset="0.1974" stopColor="#A1705F" />
        <stop offset="0.2052" stopColor="#A17060" />
        <stop offset="0.2129" stopColor="#A17060" />
        <stop offset="0.2207" stopColor="#A27061" />
        <stop offset="0.2285" stopColor="#A27060" />
        <stop offset="0.2362" stopColor="#A27060" />
        <stop offset="0.244" stopColor="#A26F61" />
        <stop offset="0.2517" stopColor="#A26F60" />
        <stop offset="0.2595" stopColor="#A26F60" />
        <stop offset="0.2672" stopColor="#A36F61" />
        <stop offset="0.275" stopColor="#A36F61" />
        <stop offset="0.2828" stopColor="#A36F61" />
        <stop offset="0.2905" stopColor="#A36F61" />
        <stop offset="0.2983" stopColor="#A36F61" />
        <stop offset="0.306" stopColor="#A36E61" />
        <stop offset="0.3138" stopColor="#A36E60" />
        <stop offset="0.3216" stopColor="#A36E60" />
        <stop offset="0.3293" stopColor="#A46E61" />
        <stop offset="0.3371" stopColor="#A46E61" />
        <stop offset="0.3448" stopColor="#A46E61" />
        <stop offset="0.3526" stopColor="#A46E61" />
        <stop offset="0.3604" stopColor="#A46E61" />
        <stop offset="0.3681" stopColor="#A56E61" />
        <stop offset="0.3759" stopColor="#A56E61" />
        <stop offset="0.3836" stopColor="#A56E61" />
        <stop offset="0.3914" stopColor="#A56E61" />
        <stop offset="0.3991" stopColor="#A56E61" />
        <stop offset="0.4069" stopColor="#A66E61" />
        <stop offset="0.4147" stopColor="#A66E61" />
        <stop offset="0.4224" stopColor="#A66E61" />
        <stop offset="0.4302" stopColor="#A66D61" />
        <stop offset="0.4379" stopColor="#A66D61" />
        <stop offset="0.4457" stopColor="#A66D61" />
        <stop offset="0.4535" stopColor="#A66D61" />
        <stop offset="0.4612" stopColor="#A66D61" />
        <stop offset="0.469" stopColor="#A76D62" />
        <stop offset="0.4767" stopColor="#A76D62" />
        <stop offset="0.4845" stopColor="#A76D62" />
        <stop offset="0.4922" stopColor="#A76D62" />
        <stop offset="0.5" stopColor="#A76D62" />
        <stop offset="0.5078" stopColor="#A86C61" />
        <stop offset="0.5155" stopColor="#A86C61" />
        <stop offset="0.5233" stopColor="#A86C61" />
        <stop offset="0.531" stopColor="#A86C62" />
        <stop offset="0.5388" stopColor="#A86C62" />
        <stop offset="0.5465" stopColor="#A86C61" />
        <stop offset="0.5543" stopColor="#A96C62" />
        <stop offset="0.5621" stopColor="#A96C62" />
        <stop offset="0.5698" stopColor="#A96C62" />
        <stop offset="0.5776" stopColor="#AA6C62" />
        <stop offset="0.5853" stopColor="#AA6C62" />
        <stop offset="0.5931" stopColor="#AA6B62" />
        <stop offset="0.6009" stopColor="#AA6B62" />
        <stop offset="0.6086" stopColor="#AA6B61" />
        <stop offset="0.6164" stopColor="#AA6B62" />
        <stop offset="0.6241" stopColor="#AA6B62" />
        <stop offset="0.6319" stopColor="#AA6B61" />
        <stop offset="0.6396" stopColor="#AA6B62" />
        <stop offset="0.6474" stopColor="#AA6B62" />
        <stop offset="0.6552" stopColor="#AA6A62" />
        <stop offset="0.6629" stopColor="#AB6B62" />
        <stop offset="0.6707" stopColor="#AB6B62" />
        <stop offset="0.6784" stopColor="#AB6A62" />
        <stop offset="0.6862" stopColor="#AB6A62" />
        <stop offset="0.694" stopColor="#AB6A61" />
        <stop offset="0.7017" stopColor="#AB6A62" />
        <stop offset="0.7095" stopColor="#AB6A62" />
        <stop offset="0.7172" stopColor="#AC6A63" />
        <stop offset="0.725" stopColor="#AC6A62" />
        <stop offset="0.7328" stopColor="#AC6A62" />
        <stop offset="0.7405" stopColor="#AC6A62" />
        <stop offset="0.7483" stopColor="#AC6A61" />
        <stop offset="0.756" stopColor="#AC6A61" />
        <stop offset="0.7638" stopColor="#AC6A62" />
        <stop offset="0.7715" stopColor="#AC6A62" />
        <stop offset="0.7793" stopColor="#AC6A61" />
        <stop offset="0.7871" stopColor="#AD6A62" />
        <stop offset="0.7948" stopColor="#AD6A62" />
        <stop offset="0.8026" stopColor="#AD6962" />
        <stop offset="0.8103" stopColor="#AD6962" />
        <stop offset="0.8181" stopColor="#AD6962" />
        <stop offset="0.8259" stopColor="#AE6963" />
        <stop offset="0.8336" stopColor="#AE6963" />
        <stop offset="0.8414" stopColor="#AE6962" />
        <stop offset="0.8491" stopColor="#AE6862" />
        <stop offset="0.8569" stopColor="#AE6862" />
        <stop offset="0.8647" stopColor="#AF6863" />
        <stop offset="0.8724" stopColor="#AF6862" />
        <stop offset="0.8802" stopColor="#AF6862" />
        <stop offset="0.8879" stopColor="#AF6863" />
        <stop offset="0.8957" stopColor="#AF6862" />
        <stop offset="0.9034" stopColor="#AF6862" />
        <stop offset="0.9112" stopColor="#AF6862" />
        <stop offset="0.919" stopColor="#AF6862" />
        <stop offset="0.9267" stopColor="#B06862" />
        <stop offset="0.9345" stopColor="#B06862" />
        <stop offset="0.9422" stopColor="#B06862" />
        <stop offset="0.95" stopColor="#B06863" />
        <stop offset="0.9578" stopColor="#B06862" />
        <stop offset="0.9655" stopColor="#B06862" />
        <stop offset="0.9733" stopColor="#B06762" />
        <stop offset="0.981" stopColor="#B06762" />
        <stop offset="0.9888" stopColor="#B16763" />
        <stop offset="0.9965" stopColor="#B16763" />
        <stop offset="1" stopColor="#B16763" />
      </linearGradient>
      <path
        fill={`url(#${id}-SVGID_3_)`}
        d="M102.64,125.97c0,0.43,0.03,0.89,0.03,1.32c1.17-0.31,2.24-0.6,2.24-0.6  c0.37-0.06,0.75-0.06,1.15-0.06c0.26,0,0.54,0,0.8,0.03c0.03-0.08,0.03-0.14,0.06-0.23c-1.09-0.57-2.3-1.15-3.36-1.69  C103.28,125.11,102.96,125.51,102.64,125.97 M105.14,123.04c-0.38,0.37-0.75,0.75-1.09,1.12c1.09,0,2.18,0.03,3.27,0.03  c0.11-0.83,0.2-1.7,0.23-2.56C106.78,122.13,105.97,122.59,105.14,123.04"
      />
      <path
        fill="#AE6777"
        d="M124.01,112.22c-0.23-0.06-0.43-0.12-0.6-0.14c2.9-0.86,5.85-1.66,8.87-2.44l-0.83,0.52c0,0,0,0-0.03,0  C128.92,110.85,126.45,111.53,124.01,112.22"
      />
      <path
        fill="#A86977"
        d="M155.8,146.16c-0.66-0.32-1.26-0.63-1.78-0.89C154.62,145.56,155.2,145.85,155.8,146.16 M118.96,129.81  c-0.75-0.63-1.49-1.29-2.21-1.89l-0.34-0.29v0.49c0.55,0.49,1.09,0.95,1.64,1.41C118.33,129.61,118.64,129.7,118.96,129.81   M147.78,126.77c-3.85-0.83-7.63-1.58-11.37-2.3c0.09,0.11,0.17,0.26,0.26,0.4c3.07,0.57,6.17,1.21,9.33,1.87l0,0  C146.52,126.74,147.26,126.77,147.78,126.77 M125.94,125.2c-0.63-0.17-1.38-0.34-2.18-0.46c-6.54-0.37-13.12-0.55-19.66-0.57  c-0.11,0.11-0.2,0.2-0.29,0.32l0.03,0.03C111.21,124.54,118.59,124.77,125.94,125.2 M141.26,126.44v-0.34  c-1.32-0.11-2.67-0.26-4.02-0.37c0.09,0.12,0.17,0.26,0.26,0.37C138.76,126.18,140,126.32,141.26,126.44 M125.86,112.68  c0.57-0.26,1.15-0.52,1.72-0.77v-0.32c-0.72,0.32-1.46,0.63-2.18,0.98C125.6,112.62,125.75,112.65,125.86,112.68"
      />
      <path
        fill="#B16763"
        d="M165.18,150.21c-1.64-0.55-6.08-2.44-9.36-4.05c-0.6-0.32-1.18-0.6-1.78-0.89  c-0.89-0.46-1.55-0.86-1.87-1.15c0,0-0.6-0.32-1.49-0.8c2.3-3.62,3.44-7.81,2.9-12.66l1.03,0.23l8.18,1.23l5.77,1.21  c0.03,0.14,0.03,0.26,0.06,0.4c0.14,1.09,0.23,2.18,0.23,3.27c0,4.08-1,8.15-3.13,12.14C165.56,149.52,165.38,149.87,165.18,150.21   M125.4,112.59c0.75-0.34,1.46-0.69,2.18-1l0,0c-0.92,0.29-1.81,0.57-2.73,0.86C125.05,112.51,125.23,112.56,125.4,112.59   M123.71,124.73c-0.66-0.09-1.41-0.17-2.21-0.23c-7.86-0.69-10.88-1.75-11.65-2.01c-1.41-0.49-1.43-0.75-2.27-0.86  c-0.03,0.86-0.11,1.72-0.23,2.55C112.8,124.27,118.25,124.45,123.71,124.73 M141.27,126.08c-1.43-0.26-2.87-0.52-4.28-0.75  c0.09,0.11,0.17,0.26,0.26,0.37C138.57,125.82,139.92,125.94,141.27,126.08 M107.46,126.68c-0.17-0.09-0.34-0.17-0.52-0.29  c-0.03,0.09-0.03,0.14-0.06,0.23C107.09,126.66,107.26,126.66,107.46,126.68 M115.3,128.58c-0.69-0.55-1.38-1.09-2.04-1.66  c-1.03,0.06-2.04,0.11-3.04,0.2c1.03,0.23,1.72,0.43,1.72,0.43C112.97,127.78,114.41,128.26,115.3,128.58 M148.5,142.21  c2.32-3.53,3.5-7.63,3.01-12.37c-1.18-0.66-2.44-1.64-3.16-2.73c-1.12-1.75-3.87-4.79-5.4-6.69c-2.1-2.61-6.86-5.02-7.55-6.11  c-0.69-1.09-1.84-2.98-2.15-3.73c-0.32-0.72-0.98-1.29-2.09-1.29c-0.06,0-0.14,0-0.2,0c-1.26,0.09-1.35,0.52-2.41,0.57  c-0.14,0-0.29,0-0.43,0c-1,0-2.12-0.17-2.12-0.17c-0.66-0.11-1.09-0.2-1.55-0.2c-0.63,1.09-1.64,1.75-4.08,1.75l-0.43-0.06  c0.23,0.52,2.35,0.83,2.84,0.83c0.03,0,0.03,0,0.06,0h0.03c0.11,0,0.29,0.03,0.52,0.09c2.9-0.86,5.85-1.66,8.87-2.44l-0.83,0.52  c-0.03,0-0.03,0-0.03,0c-1.41,0.89-2.78,1.81-4.13,2.73c0.23,0.11,0.55,0.26,0.98,0.52c2.64,1.49,6.54,5.65,7.32,9.27  c0.11,0.52,0.43,1.12,0.83,1.75c3.76,0.69,7.55,1.46,11.39,2.3c-0.52,0-1.26-0.03-1.78-0.03c-1.52-0.03-3.04-0.03-4.56-0.03  c-1.18,0-2.3,0.03-3.44,0.03c0.86,1.15,1.66,2.27,1.84,3.1c-3.47-0.23-7.81-2.04-9.7-2.9c-4.53,0.14-9.07,0.4-13.75,0.69  c0.86,0.75,1.72,1.49,2.55,2.21c3.53,1.15,9.24,3.16,11.11,4.51c1.81,1.32,11.14,4.79,13.6,5.65  C144.8,140.37,146.75,141.32,148.5,142.21 M167.02,127.66c-0.11-0.29-0.2-0.57-0.37-0.8c-0.2-0.49-0.43-0.95-0.66-1.43  c0-0.03-0.03-0.03-0.03-0.06v-0.03c0-0.03,0-0.03,0-0.03c-0.06-0.09-0.09-0.2-0.14-0.29c-0.29-0.6-0.63-1.21-0.98-1.78  c-0.11-0.03-1.52-0.43-5.08-0.43c-0.34,0-0.72,0-1.09,0c-0.03,0-0.03,0-0.06,0c-0.77,0-1.64,0.2-1.64,0.2l-2.24,1.32  c-0.29,0.46,0.72,1.06,0.72,1.06s2.81,0.17,2.81,0.92C160.33,127.43,164.75,127.55,167.02,127.66 M138.2,151.34  c0.86-0.49,1.69-1.03,2.53-1.58c-0.49-0.09-1.18-0.17-2.1-0.17C137.83,149.59,137.88,150.42,138.2,151.34 M157.86,159.15  c0.34-0.32,0.66-0.63,1.03-0.92c1.29-1.26,2.41-2.53,3.44-3.82c-4.97-0.11-12.03-0.2-17.39-2.98c-0.17-0.55-0.57-0.83-1-1  c-1.46,1.12-3.04,2.12-4.74,3.07c0.14,0.23,0.23,0.4,0.23,0.4c1.64,1.09,7.52,2.76,8.75,2.93c1.23,0.14,5.34,1.38,5.34,1.38  S155.65,158.49,157.86,159.15"
      />
      <path
        fill="#AA6972"
        d="M148.93,142.43c-0.14-0.06-0.29-0.14-0.43-0.2c2.32-3.53,3.5-7.61,3.04-12.34c0.03,0.03,0.06,0.03,0.09,0.06  C152.26,134.68,151.17,138.84,148.93,142.43 M138.42,151.94c1.06-0.63,2.07-1.26,3.04-1.95c-0.17-0.06-0.43-0.14-0.75-0.2  c-0.8,0.55-1.66,1.06-2.53,1.58C138.28,151.54,138.34,151.74,138.42,151.94"
      />
      <path
        fill="#987A8F"
        d="M127.28,112.94c-0.6-0.26-0.69-0.11-1.41-0.23h-0.03c0.57-0.26,1.15-0.52,1.75-0.77v-0.32  c-0.92,0.29-1.84,0.57-2.73,0.86c-0.29-0.06-0.57-0.14-0.86-0.2c2.44-0.72,4.91-1.38,7.43-2.04  C130.01,111.1,128.63,112.02,127.28,112.94 M105.15,123.04c0.2-0.17,0.37-0.37,0.6-0.57c0.32-0.29,0.52-0.6,0.69-0.89l0.72,0.03  c0.17,0,0.32,0.03,0.46,0.03C106.76,122.12,105.96,122.58,105.15,123.04 M146,126.74c-1.52-0.03-3.04-0.03-4.56-0.03  c-1.15,0-2.3,0-3.42,0.03c-0.17-0.23-0.32-0.43-0.49-0.66c1.26,0.11,2.5,0.23,3.76,0.34v-0.34c-1.35-0.14-2.7-0.26-4.02-0.37  c1.35,0.11,2.7,0.26,4.02,0.37c-1.44-0.26-2.87-0.52-4.31-0.75c-0.11-0.14-0.2-0.32-0.32-0.46  C139.74,125.45,142.84,126.08,146,126.74 M147.77,126.77L147.77,126.77c-3.85-0.83-7.63-1.61-11.39-2.3  C140.17,125.19,143.93,125.94,147.77,126.77 M100.48,127.83c0.66-0.17,1.23-0.49,1.55-1c0.2-0.32,0.4-0.6,0.57-0.86  c0,0.46,0.03,0.89,0.03,1.32C101.91,127.49,101.08,127.69,100.48,127.83 M118.96,129.81L118.96,129.81  c-0.75-0.63-1.46-1.26-2.21-1.89l-0.34-0.29v0.49c0.55,0.46,1.09,0.95,1.64,1.41c-1.18-0.37-1.95-0.63-1.95-0.63  s-0.32-0.11-0.77-0.29c-0.69-0.57-1.35-1.12-2.04-1.66c-1,0.06-2.04,0.14-3.04,0.2c-0.77-0.17-1.75-0.34-2.76-0.43  c-0.17-0.09-0.34-0.17-0.52-0.29c-1.09-0.57-2.3-1.15-3.36-1.69c0.06-0.09,0.14-0.17,0.2-0.23l0.03,0.03  c7.38,0.03,14.75,0.26,22.1,0.69c1.58,0.43,2.47,0.89,2.47,0.89l0.77,0.37c0,0,0.37,0.17,0.98,0.46c-4.53,0.14-9.1,0.4-13.75,0.69  C117.27,128.35,118.1,129.07,118.96,129.81 M150.65,143.31c2.3-3.62,3.44-7.81,2.93-12.66h-0.03c-0.52-0.11-1.18-0.37-1.89-0.75  c0.6,4.79-0.49,8.95-2.73,12.51C149.56,142.73,150.16,143.05,150.65,143.31 M165.99,125.31L165.99,125.31 M166.02,125.37  c0-0.03-0.03-0.03-0.03-0.06C166.02,125.34,166.02,125.37,166.02,125.37 M139.18,153.47c1.66-0.95,3.27-1.95,4.76-3.07  c-0.37-0.14-0.77-0.17-1.12-0.17c-0.43,0-0.77,0.06-0.77,0.06s-0.11-0.14-0.55-0.32c-0.98,0.69-2.01,1.32-3.07,1.95  C138.66,152.52,138.98,153.1,139.18,153.47"
      />
      <path
        fill="#F9A93F"
        d="M126.9,72.17l-1.69-1.58c-0.11-0.52,0.46-1.23,0.6-2.12l-0.52-0.2c-0.4-1.52-0.75-4.28,0-5.74  c0.34-0.72,0.77-1.66,0.55-2.5c-1.38-4.68-4.08-8.75-5.97-13.17c-0.52-1.21-0.43-2.07-0.52-3.3c-1.46-1.64-3.19-5.88-3.99-8.5  c-1.72,4.33-2.87,9.33-2.87,10.48c0,4.88,4.97,7.26,3.24,15.38c-0.34,1.58-0.92,3.73-1.49,5.97c1.03,5.65,1.03,9.76,2.55,16.33  c2.12,2.09,3.87,4.79,4.82,8.21c0.57,2.12,2.35,7.09,4.65,7.81c1.41,0.46-4.79,1.61-6.54-0.6c-1.69-2.12-4.62-3.82-6-6.06  c-1.09-1.78-2.81-5.63-3.9-7.43l-1.32,6.95c1.81,7.43,0.72,9.07-0.89,15.1c-0.69,2.61-5.94-9.59-5.97-10.53  c0-2.64-0.17-3.62-0.77-5.97c-1.09-2.15-0.98-5.19-0.83-7.52c0.26-3.87,0.23-11.16,0.37-13.09c-1.32-3.27-4.74-9.16-5.08-12.46  c-0.52-5.17,0.34-10.39-0.37-15.56c-0.89,2.58-1.84,5.85-3.85,7.84c-3.01,2.96-5.77,6.23-8.47,9.5c-0.98,1.35-0.11,1.98-1.64,4.13  c-1.49,2.09-0.69,1.15-1,3.16c-0.06,0.34-0.23,0.63-0.34,0.75c-0.8,0.66-1.64,1.23-2.78,0.77c-2.21-1.12-2.38-2.76-2.53-4.85  c-0.29-4.02,2.7-4.22,4.39-6.66c3.3-4.79,4.99-12.83,8.55-16.44c0.23-0.72,1.06-3.3,2.64-7.12c0.06-4.76,1.23-9.01,6.14-10.96  c2.01-0.8,4.65-1,4.74-3.79c0-0.34-0.06-1.18-0.26-1.49c-0.8-0.66-1.38-0.66-1.78-1.12c-0.8-1.03-1.46-7.58-1.38-8.01  c1.15-5.57,3.82-7.4,7.18-7.26c3.99,0.2,7.15,2.12,6.97,7.46c-0.14,4.31-4.59,9.84,2.07,11.94c2.55,0.8,3.01,0.26,5.22,2.44  c2.44,2.47,3.04,6.83,3.44,10.88l2.5,5.8c4.59,7.72,2.93,10.16,4.59,17.99c0.43,2.04,1.18,3.82,1.35,8.27  C130.89,67.35,129.22,72.09,126.9,72.17"
      />
      <linearGradient
        id={`${id}-SVGID_4_`}
        gradientUnits="userSpaceOnUse"
        x1="-564.7075"
        y1="262.6658"
        x2="-562.2404"
        y2="262.6658"
        gradientTransform="matrix(26.2212 26.2212 26.2212 -26.2212 8000.6489 21739.6152)"
      >
        <stop offset="0" stopColor="#7076B8" />
        <stop offset="4.280000e-03" stopColor="#7076B8" />
        <stop offset="0.012" stopColor="#7076B8" />
        <stop offset="0.0198" stopColor="#7076B8" />
        <stop offset="0.0275" stopColor="#7076B7" />
        <stop offset="0.0353" stopColor="#7076B7" />
        <stop offset="0.043" stopColor="#7076B7" />
        <stop offset="0.0507" stopColor="#7177B7" />
        <stop offset="0.0585" stopColor="#7177B7" />
        <stop offset="0.0662" stopColor="#7077B7" />
        <stop offset="0.074" stopColor="#7077B7" />
        <stop offset="0.0817" stopColor="#7077B7" />
        <stop offset="0.0895" stopColor="#7077B6" />
        <stop offset="0.0972" stopColor="#7077B6" />
        <stop offset="0.105" stopColor="#7077B6" />
        <stop offset="0.1127" stopColor="#7077B6" />
        <stop offset="0.1205" stopColor="#7077B5" />
        <stop offset="0.1282" stopColor="#7077B5" />
        <stop offset="0.1359" stopColor="#7077B5" />
        <stop offset="0.1437" stopColor="#7177B6" />
        <stop offset="0.1514" stopColor="#7177B6" />
        <stop offset="0.1592" stopColor="#7177B5" />
        <stop offset="0.1669" stopColor="#7177B5" />
        <stop offset="0.1747" stopColor="#7077B5" />
        <stop offset="0.1824" stopColor="#7077B5" />
        <stop offset="0.1902" stopColor="#7077B5" />
        <stop offset="0.1979" stopColor="#7077B5" />
        <stop offset="0.2057" stopColor="#7077B5" />
        <stop offset="0.2134" stopColor="#7077B5" />
        <stop offset="0.2212" stopColor="#7077B4" />
        <stop offset="0.2289" stopColor="#7077B4" />
        <stop offset="0.2367" stopColor="#7177B5" />
        <stop offset="0.2444" stopColor="#7177B5" />
        <stop offset="0.2521" stopColor="#7177B5" />
        <stop offset="0.2599" stopColor="#7177B4" />
        <stop offset="0.2676" stopColor="#7177B4" />
        <stop offset="0.2754" stopColor="#7177B4" />
        <stop offset="0.2831" stopColor="#7177B4" />
        <stop offset="0.2909" stopColor="#7177B3" />
        <stop offset="0.2986" stopColor="#7177B3" />
        <stop offset="0.3064" stopColor="#7177B3" />
        <stop offset="0.3141" stopColor="#7177B3" />
        <stop offset="0.3219" stopColor="#7177B3" />
        <stop offset="0.3296" stopColor="#7177B3" />
        <stop offset="0.3373" stopColor="#7177B3" />
        <stop offset="0.3451" stopColor="#7177B3" />
        <stop offset="0.3528" stopColor="#7278B2" />
        <stop offset="0.3606" stopColor="#7278B2" />
        <stop offset="0.3683" stopColor="#7278B2" />
        <stop offset="0.3761" stopColor="#7278B2" />
        <stop offset="0.3838" stopColor="#7278B2" />
        <stop offset="0.3916" stopColor="#7178B2" />
        <stop offset="0.3993" stopColor="#7178B2" />
        <stop offset="0.4071" stopColor="#7178B2" />
        <stop offset="0.4148" stopColor="#7177B2" />
        <stop offset="0.4225" stopColor="#7177B1" />
        <stop offset="0.4303" stopColor="#7177B1" />
        <stop offset="0.438" stopColor="#7177B1" />
        <stop offset="0.4458" stopColor="#7177B1" />
        <stop offset="0.4535" stopColor="#7177B0" />
        <stop offset="0.4613" stopColor="#7177B0" />
        <stop offset="0.469" stopColor="#7177B0" />
        <stop offset="0.4768" stopColor="#7177B0" />
        <stop offset="0.4845" stopColor="#7177B0" />
        <stop offset="0.4922" stopColor="#7177B0" />
        <stop offset="0.5" stopColor="#7277B0" />
        <stop offset="0.5077" stopColor="#7277B0" />
        <stop offset="0.5155" stopColor="#7277B0" />
        <stop offset="0.5232" stopColor="#7277B0" />
        <stop offset="0.531" stopColor="#7277B0" />
        <stop offset="0.5387" stopColor="#7277B0" />
        <stop offset="0.5465" stopColor="#7277B0" />
        <stop offset="0.5542" stopColor="#7277AF" />
        <stop offset="0.562" stopColor="#7277AF" />
        <stop offset="0.5697" stopColor="#7277AF" />
        <stop offset="0.5775" stopColor="#7277AF" />
        <stop offset="0.5852" stopColor="#7277AE" />
        <stop offset="0.5929" stopColor="#7378AF" />
        <stop offset="0.6007" stopColor="#7378AF" />
        <stop offset="0.6084" stopColor="#7378AF" />
        <stop offset="0.6162" stopColor="#7278AE" />
        <stop offset="0.6239" stopColor="#7278AE" />
        <stop offset="0.6317" stopColor="#7278AE" />
        <stop offset="0.6394" stopColor="#7278AE" />
        <stop offset="0.6472" stopColor="#7278AE" />
        <stop offset="0.6549" stopColor="#7278AE" />
        <stop offset="0.6627" stopColor="#7278AE" />
        <stop offset="0.6704" stopColor="#7278AE" />
        <stop offset="0.6781" stopColor="#7278AE" />
        <stop offset="0.6859" stopColor="#7378AE" />
        <stop offset="0.6936" stopColor="#7378AE" />
        <stop offset="0.7014" stopColor="#7378AE" />
        <stop offset="0.7091" stopColor="#7378AE" />
        <stop offset="0.7169" stopColor="#7378AD" />
        <stop offset="0.7246" stopColor="#7278AD" />
        <stop offset="0.7324" stopColor="#7278AD" />
        <stop offset="0.7401" stopColor="#7278AD" />
        <stop offset="0.7479" stopColor="#7278AD" />
        <stop offset="0.7556" stopColor="#7278AC" />
        <stop offset="0.7634" stopColor="#7278AC" />
        <stop offset="0.7711" stopColor="#7278AC" />
        <stop offset="0.7788" stopColor="#7278AC" />
        <stop offset="0.7866" stopColor="#7278AC" />
        <stop offset="0.7943" stopColor="#7278AC" />
        <stop offset="0.8021" stopColor="#7278AC" />
        <stop offset="0.8098" stopColor="#7278AC" />
        <stop offset="0.8176" stopColor="#7278AB" />
        <stop offset="0.8253" stopColor="#7278AB" />
        <stop offset="0.8331" stopColor="#7379AC" />
        <stop offset="0.8408" stopColor="#7379AC" />
        <stop offset="0.8486" stopColor="#7379AB" />
        <stop offset="0.8563" stopColor="#7379AB" />
        <stop offset="0.864" stopColor="#7378AB" />
        <stop offset="0.8718" stopColor="#7378AB" />
        <stop offset="0.8795" stopColor="#7378AB" />
        <stop offset="0.8873" stopColor="#7378AB" />
        <stop offset="0.895" stopColor="#7378AB" />
        <stop offset="0.9028" stopColor="#7378AB" />
        <stop offset="0.9105" stopColor="#7378AB" />
        <stop offset="0.9183" stopColor="#7378AA" />
        <stop offset="0.926" stopColor="#7378AA" />
        <stop offset="0.9338" stopColor="#7378AA" />
        <stop offset="0.9415" stopColor="#7278AA" />
        <stop offset="0.9492" stopColor="#7278A9" />
        <stop offset="0.957" stopColor="#7378AA" />
        <stop offset="0.9647" stopColor="#7378AA" />
        <stop offset="0.9725" stopColor="#7378AA" />
        <stop offset="0.9802" stopColor="#7378A9" />
        <stop offset="0.988" stopColor="#7378A9" />
        <stop offset="0.9957" stopColor="#7378A9" />
        <stop offset="1" stopColor="#7378A9" />
      </linearGradient>
      <path
        fill={`url(#${id}-SVGID_4_)`}
        d="M99.29,7.96c0.03,0.34,0.2,5.63,0.98,6.75c1.52,1.15,2.38,0.8,2.3,3.65  c-0.08,2.38-1.61,3.79-3.67,4.53c-3.36,1.17-5.08,1.86-6.2,5.34c-0.34,1.09-0.66,2.67-0.66,4.99v0.15c-0.95,2.38-2.18,5.11-2.9,7.66  c-4.13,4.16-6.2,13.57-10.39,17.56c-2.78,2.64-3.62,2.81-2.61,6.89c0.11,0.4,1.43,1.47,1.72,1.64l1.29-0.8  c0.2-2.07-0.08-1.89,1.24-3.79c1.21-1.75,0.63-2.67,1.69-4.19c2.64-3.3,5.14-6.63,8.09-9.64c1.98-2.01,4.68-8.81,5.31-11.19  c0.11-0.34,0.31-0.52,0.4-0.23c0.4,4.53,1.06,8.32,0.89,12.8c-0.34,9.39-0.08,8.41,3.82,17.16c0.31-3.53,1.17-8.64,3.21-10.36  c-2.41,9.13-2.56,22.16-2.81,26.14c-0.15,2.04-0.69,5.25,0.29,7.12c0.31,1.26,0.34,3.18,0.37,4.65c0,0.89,0.06,16.01,0.06,16.01  l-1.4,7.03c-0.49,2.04-3.13,5.43-5.05,6.49c-0.6,0.34-2.07,1.12-2.07,1.78c0,1.12,7.14,3.19,8.78,0.66c1.23-1.89,2.24-2.93,3.7-4.34  c2.24-2.15-0.26-4.39,0.06-7.29c0.52-5.08,2.7-9.5,3.42-14.32c0.43-2.9,0.34-5.45-0.95-8.76l0.95-9.18c1.06,1.58,2.04,4.11,3.04,6.2  c1.78,3.73,1.81,4.08,4.91,7.15c1.03,1.03,2.12,2.24,2.9,3.5c1.46,2.3,2.44,4.59,2.32,7.35c-1.06,1.92-1.52,1.81-2.9,2.98  c0.06,0.06-0.38,1.12,0.92,1.12c4.65,0,4.08-2.44,5.82-5.56c1.15-2.04,4.39-5.14,0.83-6.2c-1.12-0.34-2.18-1.01-2.84-2.1  c-2.47-4.13-2.58-4.04-3.87-7.86c-0.78-2.32-2.38-4.19-4.25-5.68c-1.15-2.61-1.61-4.45-1.98-7.23c-0.49-3.76-0.83-6.43-1.49-10.27  c1.81-7.2,2.76-8.73-0.34-15.64c-0.72-1.58-1.12-3.27-1.12-5.17c0-2.3,1.26-7.46,2.49-10.16c0.43-1.09,1.03-2.12,1.87-2.44  c0.75,2.79,3.33,8.53,4.82,9.93c0.08,1.12,0.06,2.27,0.49,3.33c1.89,4.53,4.59,8.64,5.94,13.43c0.46,1.64-0.15,2.44-0.63,3.76  c-0.15,0.63-0.17,2.47,0.11,3.85l0.66,0.34c-0.11,0.4-0.4,1.58-0.63,2.09c0.09,0.66,0.89,1.01,0.89,1.01  c1.03-0.23,2.53-3.99,2.47-5.48c-0.17-4.59-1.12-6.66-1.41-8.01c-1.52-7.78-0.66-9.93-4.99-17.48l-2.47-6.14  c-0.31-3.13-1.55-10.3-5.57-11.59c-0.69-0.2-1.35-0.26-2.38-0.57c-5.25-1.69-5.25-5.74-3.82-10.16c1.29-3.93,1.44-8.55-4.33-9.04  c-0.17-0.03-0.34-0.03-0.52-0.03C101.04,2.19,100.03,4.89,99.29,7.96"
      />
    </g>
  </g>
);
export const logoLight = ({ id }: { id: string }) => (
  <svg
    x="0px"
    y="0px"
    viewBox="0.14287 0.28555 206.69426 249.5716"
    fill="#111111"
  >
    <path
      fill="#2C3696"
      d="M122.39,236.24c-0.89,5.6-3.76,8.52-7.23,8.52c-2.21,0-3.47-1.55-3.1-3.93l1.21-7.58  c0.46-2.81,2.15-5.02,5.17-5.02C121.79,228.23,123.31,230.5,122.39,236.24 M110.54,247.38c0.46,0,1.58,1.95,5.25,1.95  c7.78,0,12.23-5.62,13.43-12.89c1.55-8.95-2.81-13.03-8.29-13.03c-2.58,0-4.51,0.23-5.91,0.98l2.1-12.31h-6.46l-6.43,36.79h4.88  c0,0,0.69-1.52,1.46-1.52h-0.03V247.38z M179.24,231.71c0.98-5.57-1.09-8.29-7.12-8.29c-4.51,0-6.26,1.98-7.95,3.67l0.17-3.1  l-5.97,0.03l-0.46,4.59l-3.47,20.32h6.54l2.1-13.17c0.75-4.53,3.87-8.01,6.83-8.01c3.27,0,3.24,1.87,2.73,4.74l-2.84,16.47h6.49  L179.24,231.71z M206.57,223.47h-7.63l-8.78,9.3l-0.11-0.03l3.5-20.61h-6.37l-6.43,36.76h6.46l0.66-3.67l1.32-8.06  c3.42,0,5.34,0.37,6.83,7.18l1.03,4.56h6.6c0,0-1.64-6.95-2.73-9.67c-1.12-2.87-2.35-4.74-4.97-5.25L206.57,223.47z M18.9,232.48  c4.74-1.03,7.18-4.85,7.84-7.35c1.69-6.83-1.35-12.17-10.07-12.08H6.67l-6.26,35.87h6.51l2.58-14.41c6-0.17,6.74,1.29,7.86,8.29  l1.03,6.11h6.74c-0.8-3.7-1.32-7.2-1.98-10.02c-0.69-2.96-1.81-5.25-4.62-6.34L18.9,232.48z M20.22,223.93  c-0.57,3.19-3.04,5.42-6.08,5.42h-3.85l1.98-11.34l3.5-0.03C19.9,218.02,20.7,220.74,20.22,223.93 M49.63,230.73  c0.95-5.42-1.98-7.32-7.84-7.32c-7.32,0-10.5,3.47-10.5,3.47l2.24,3.79c0,0,2.35-2.76,7.09-2.76c2.64,0,2.7,1.32,2.44,2.76  l-0.52,3.24c-9.41-0.23-14.24,1.78-15.33,7.95c-0.89,5.05,2.9,7.49,7.18,7.49c2.21,0,3.99-0.32,6.14-2.21  c0.43,1.21,1.18,1.87,2.01,2.01c1.35,0.29,3.7-0.03,4.39-0.55c-0.06-0.75,0-2.67,0.8-7.18L49.63,230.73z M41.91,237.33  c-1.03,7.4-2.04,8.15-5.6,8.15c-2.44,0-3.33-1.66-2.93-3.85C33.96,238.62,36.2,237.33,41.91,237.33 M152.9,230.73  c0.95-5.42-1.98-7.32-7.84-7.32c-7.32,0-10.48,3.47-10.48,3.47l2.24,3.79c0,0,2.35-2.76,7.09-2.76c2.64,0,2.7,1.32,2.44,2.76  l-0.52,3.24c-9.41-0.23-14.24,1.78-15.33,7.95c-0.89,5.05,2.9,7.49,7.18,7.49c2.21,0,3.99-0.32,6.14-2.21  c0.43,1.21,1.18,1.87,2.01,2.01c1.35,0.29,3.7-0.03,4.39-0.55c-0.06-0.75,0-2.67,0.8-7.18L152.9,230.73z M145.18,237.33  c-1.03,7.4-2.04,8.15-5.6,8.15c-2.44,0-3.33-1.66-2.93-3.85C137.23,238.62,139.47,237.33,145.18,237.33 M62.69,249.36  c7.78,0,12.23-5.63,13.43-12.89c1.55-8.95-2.81-13.03-8.29-13.03c-2.58,0-4.42,0.23-5.88,0.98l2.1-12.31h-6.49l-6.43,36.79h4.88  c0,0,0.69-1.52,1.41-1.52C57.93,247.38,59.05,249.36,62.69,249.36 M65.42,228.23c3.33,0,4.74,2.24,3.96,8.01  c-0.8,5.88-3.76,8.52-7.29,8.52c-2.21,0-3.47-1.55-3.04-3.93l1.23-7.58c0.46-2.81,2.15-5.02,5.11-5.02H65.42z M78.88,238.48  c1-9.36,5.22-15.15,15.27-15.15c7.46,0,9.9,5.68,8.93,11.8c-1.61,9.79-5.4,14.38-14.95,14.38C81.89,249.5,78.22,244.45,78.88,238.48   M96.24,235.58c0.49-2.58,0.98-7.61-3.47-7.61c-2.98,0-5.8,2.04-7.06,9.16c-0.77,4.33,0.06,7.84,3.53,7.84  C91.82,244.94,94.89,242.84,96.24,235.58"
    />
    <linearGradient
      id={`${id}-SVGID_1_`}
      gradientUnits="userSpaceOnUse"
      x1="-558.2126"
      y1="254.0371"
      x2="-555.7452"
      y2="254.0371"
      gradientTransform="matrix(73.2704 0 0 -73.2704 40935.2188 18762.3984)"
    >
      <stop offset="0" stopColor="#C95222" />
      <stop offset="2.170000e-03" stopColor="#C95222" />
      <stop offset="6.060000e-03" stopColor="#C95222" />
      <stop offset="9.950000e-03" stopColor="#C85222" />
      <stop offset="0.0138" stopColor="#C85222" />
      <stop offset="0.0177" stopColor="#C85122" />
      <stop offset="0.0216" stopColor="#C75122" />
      <stop offset="0.0255" stopColor="#C75122" />
      <stop offset="0.0294" stopColor="#C65122" />
      <stop offset="0.0333" stopColor="#C65123" />
      <stop offset="0.0372" stopColor="#C65123" />
      <stop offset="0.0411" stopColor="#C55123" />
      <stop offset="0.045" stopColor="#C55023" />
      <stop offset="0.0489" stopColor="#C55023" />
      <stop offset="0.0527" stopColor="#C45023" />
      <stop offset="0.0566" stopColor="#C45023" />
      <stop offset="0.0605" stopColor="#C45023" />
      <stop offset="0.0644" stopColor="#C35023" />
      <stop offset="0.0683" stopColor="#C35023" />
      <stop offset="0.0722" stopColor="#C34F23" />
      <stop offset="0.0761" stopColor="#C24F23" />
      <stop offset="0.08" stopColor="#C24F23" />
      <stop offset="0.0838" stopColor="#C14F23" />
      <stop offset="0.0877" stopColor="#C14F23" />
      <stop offset="0.0916" stopColor="#C14F24" />
      <stop offset="0.0955" stopColor="#C04F24" />
      <stop offset="0.0994" stopColor="#C04E24" />
      <stop offset="0.1033" stopColor="#C04E24" />
      <stop offset="0.1072" stopColor="#BF4E24" />
      <stop offset="0.1111" stopColor="#BF4E24" />
      <stop offset="0.115" stopColor="#BF4E24" />
      <stop offset="0.1189" stopColor="#BE4E24" />
      <stop offset="0.1227" stopColor="#BE4E24" />
      <stop offset="0.1266" stopColor="#BE4E24" />
      <stop offset="0.1305" stopColor="#BD4D24" />
      <stop offset="0.1344" stopColor="#BD4D24" />
      <stop offset="0.1383" stopColor="#BC4D24" />
      <stop offset="0.1422" stopColor="#BC4D24" />
      <stop offset="0.1461" stopColor="#BC4D24" />
      <stop offset="0.15" stopColor="#BB4D25" />
      <stop offset="0.1539" stopColor="#BB4D25" />
      <stop offset="0.1577" stopColor="#BB4C25" />
      <stop offset="0.1616" stopColor="#BA4C25" />
      <stop offset="0.1655" stopColor="#BA4C25" />
      <stop offset="0.1694" stopColor="#BA4C25" />
      <stop offset="0.1733" stopColor="#B94C25" />
      <stop offset="0.1772" stopColor="#B94C25" />
      <stop offset="0.1811" stopColor="#B84C25" />
      <stop offset="0.185" stopColor="#B84B25" />
      <stop offset="0.1889" stopColor="#B84B25" />
      <stop offset="0.1928" stopColor="#B74B25" />
      <stop offset="0.1966" stopColor="#B74B25" />
      <stop offset="0.2005" stopColor="#B74B25" />
      <stop offset="0.2044" stopColor="#B64B25" />
      <stop offset="0.2083" stopColor="#B64B26" />
      <stop offset="0.2122" stopColor="#B64A26" />
      <stop offset="0.2161" stopColor="#B54A26" />
      <stop offset="0.22" stopColor="#B54A26" />
      <stop offset="0.2239" stopColor="#B54A26" />
      <stop offset="0.2278" stopColor="#B44A26" />
      <stop offset="0.2316" stopColor="#B44A26" />
      <stop offset="0.2355" stopColor="#B34A26" />
      <stop offset="0.2394" stopColor="#B34926" />
      <stop offset="0.2433" stopColor="#B34926" />
      <stop offset="0.2472" stopColor="#B24926" />
      <stop offset="0.2511" stopColor="#B24926" />
      <stop offset="0.255" stopColor="#B24926" />
      <stop offset="0.2589" stopColor="#B14926" />
      <stop offset="0.2628" stopColor="#B14926" />
      <stop offset="0.2666" stopColor="#B14827" />
      <stop offset="0.2705" stopColor="#B04827" />
      <stop offset="0.2744" stopColor="#B04827" />
      <stop offset="0.2783" stopColor="#AF4827" />
      <stop offset="0.2822" stopColor="#AF4827" />
      <stop offset="0.2861" stopColor="#AF4827" />
      <stop offset="0.29" stopColor="#AE4827" />
      <stop offset="0.2939" stopColor="#AE4727" />
      <stop offset="0.2978" stopColor="#AE4727" />
      <stop offset="0.3016" stopColor="#AD4727" />
      <stop offset="0.3055" stopColor="#AD4727" />
      <stop offset="0.3094" stopColor="#AD4727" />
      <stop offset="0.3133" stopColor="#AC4727" />
      <stop offset="0.3172" stopColor="#AC4727" />
      <stop offset="0.3211" stopColor="#AC4627" />
      <stop offset="0.325" stopColor="#AB4628" />
      <stop offset="0.3289" stopColor="#AB4628" />
      <stop offset="0.3328" stopColor="#AA4628" />
      <stop offset="0.3367" stopColor="#AA4628" />
      <stop offset="0.3405" stopColor="#AA4628" />
      <stop offset="0.3444" stopColor="#A94628" />
      <stop offset="0.3483" stopColor="#A94528" />
      <stop offset="0.3522" stopColor="#A94528" />
      <stop offset="0.3561" stopColor="#A84528" />
      <stop offset="0.36" stopColor="#A84528" />
      <stop offset="0.3639" stopColor="#A84528" />
      <stop offset="0.3678" stopColor="#A74528" />
      <stop offset="0.3717" stopColor="#A74528" />
      <stop offset="0.3755" stopColor="#A74528" />
      <stop offset="0.3794" stopColor="#A64428" />
      <stop offset="0.3833" stopColor="#A64429" />
      <stop offset="0.3872" stopColor="#A54429" />
      <stop offset="0.3911" stopColor="#A54429" />
      <stop offset="0.395" stopColor="#A54429" />
      <stop offset="0.3989" stopColor="#A44429" />
      <stop offset="0.4028" stopColor="#A44429" />
      <stop offset="0.4067" stopColor="#A44329" />
      <stop offset="0.4105" stopColor="#A34329" />
      <stop offset="0.4144" stopColor="#A34329" />
      <stop offset="0.4183" stopColor="#A34329" />
      <stop offset="0.4222" stopColor="#A24329" />
      <stop offset="0.4261" stopColor="#A24329" />
      <stop offset="0.43" stopColor="#A14329" />
      <stop offset="0.4339" stopColor="#A14229" />
      <stop offset="0.4378" stopColor="#A14229" />
      <stop offset="0.4417" stopColor="#A0422A" />
      <stop offset="0.4455" stopColor="#A0422A" />
      <stop offset="0.4494" stopColor="#A0422A" />
      <stop offset="0.4533" stopColor="#9F422A" />
      <stop offset="0.4572" stopColor="#9F422A" />
      <stop offset="0.4611" stopColor="#9F412A" />
      <stop offset="0.465" stopColor="#9E412A" />
      <stop offset="0.4689" stopColor="#9E412A" />
      <stop offset="0.4728" stopColor="#9E412A" />
      <stop offset="0.4767" stopColor="#9D412A" />
      <stop offset="0.4805" stopColor="#9D412A" />
      <stop offset="0.4844" stopColor="#9C412A" />
      <stop offset="0.4883" stopColor="#9C402A" />
      <stop offset="0.4922" stopColor="#9C402A" />
      <stop offset="0.4961" stopColor="#9B402A" />
      <stop offset="0.5" stopColor="#9B402A" />
      <stop offset="0.5039" stopColor="#9B402B" />
      <stop offset="0.5078" stopColor="#9A402B" />
      <stop offset="0.5117" stopColor="#9A402B" />
      <stop offset="0.5156" stopColor="#9A3F2B" />
      <stop offset="0.5195" stopColor="#993F2B" />
      <stop offset="0.5233" stopColor="#993F2B" />
      <stop offset="0.5272" stopColor="#983F2B" />
      <stop offset="0.5311" stopColor="#983F2B" />
      <stop offset="0.535" stopColor="#983F2B" />
      <stop offset="0.5389" stopColor="#973F2B" />
      <stop offset="0.5428" stopColor="#973E2B" />
      <stop offset="0.5467" stopColor="#973E2B" />
      <stop offset="0.5506" stopColor="#963E2B" />
      <stop offset="0.5544" stopColor="#963E2B" />
      <stop offset="0.5583" stopColor="#963E2B" />
      <stop offset="0.5622" stopColor="#953E2C" />
      <stop offset="0.5661" stopColor="#953E2C" />
      <stop offset="0.57" stopColor="#953D2C" />
      <stop offset="0.5739" stopColor="#943D2C" />
      <stop offset="0.5778" stopColor="#943D2C" />
      <stop offset="0.5817" stopColor="#933D2C" />
      <stop offset="0.5856" stopColor="#933D2C" />
      <stop offset="0.5895" stopColor="#933D2C" />
      <stop offset="0.5933" stopColor="#923D2C" />
      <stop offset="0.5972" stopColor="#923C2C" />
      <stop offset="0.6011" stopColor="#923C2C" />
      <stop offset="0.605" stopColor="#913C2C" />
      <stop offset="0.6089" stopColor="#913C2C" />
      <stop offset="0.6128" stopColor="#913C2C" />
      <stop offset="0.6167" stopColor="#903C2C" />
      <stop offset="0.6206" stopColor="#903C2D" />
      <stop offset="0.6245" stopColor="#903B2D" />
      <stop offset="0.6284" stopColor="#8F3B2D" />
      <stop offset="0.6322" stopColor="#8F3B2D" />
      <stop offset="0.6361" stopColor="#8E3B2D" />
      <stop offset="0.64" stopColor="#8E3B2D" />
      <stop offset="0.6439" stopColor="#8E3B2D" />
      <stop offset="0.6478" stopColor="#8D3B2D" />
      <stop offset="0.6517" stopColor="#8D3B2D" />
      <stop offset="0.6556" stopColor="#8D3A2D" />
      <stop offset="0.6595" stopColor="#8C3A2D" />
      <stop offset="0.6633" stopColor="#8C3A2D" />
      <stop offset="0.6672" stopColor="#8C3A2D" />
      <stop offset="0.6711" stopColor="#8B3A2D" />
      <stop offset="0.675" stopColor="#8B3A2D" />
      <stop offset="0.6789" stopColor="#8A3A2E" />
      <stop offset="0.6828" stopColor="#8A392E" />
      <stop offset="0.6867" stopColor="#8A392E" />
      <stop offset="0.6906" stopColor="#89392E" />
      <stop offset="0.6945" stopColor="#89392E" />
      <stop offset="0.6984" stopColor="#89392E" />
      <stop offset="0.7022" stopColor="#88392E" />
      <stop offset="0.7061" stopColor="#88392E" />
      <stop offset="0.71" stopColor="#88382E" />
      <stop offset="0.7139" stopColor="#87382E" />
      <stop offset="0.7178" stopColor="#87382E" />
      <stop offset="0.7217" stopColor="#87382E" />
      <stop offset="0.7256" stopColor="#86382E" />
      <stop offset="0.7295" stopColor="#86382E" />
      <stop offset="0.7334" stopColor="#85382E" />
      <stop offset="0.7372" stopColor="#85372F" />
      <stop offset="0.7411" stopColor="#85372F" />
      <stop offset="0.745" stopColor="#84372F" />
      <stop offset="0.7489" stopColor="#84372F" />
      <stop offset="0.7528" stopColor="#84372F" />
      <stop offset="0.7567" stopColor="#83372F" />
      <stop offset="0.7606" stopColor="#83372F" />
      <stop offset="0.7645" stopColor="#83362F" />
      <stop offset="0.7684" stopColor="#82362F" />
      <stop offset="0.7722" stopColor="#82362F" />
      <stop offset="0.7761" stopColor="#81362F" />
      <stop offset="0.78" stopColor="#81362F" />
      <stop offset="0.7839" stopColor="#81362F" />
      <stop offset="0.7878" stopColor="#80362F" />
      <stop offset="0.7917" stopColor="#80352F" />
      <stop offset="0.7956" stopColor="#803530" />
      <stop offset="0.7995" stopColor="#7F3530" />
      <stop offset="0.8034" stopColor="#7F3530" />
      <stop offset="0.8073" stopColor="#7F3530" />
      <stop offset="0.8111" stopColor="#7E3530" />
      <stop offset="0.815" stopColor="#7E3530" />
      <stop offset="0.8189" stopColor="#7E3430" />
      <stop offset="0.8228" stopColor="#7D3430" />
      <stop offset="0.8267" stopColor="#7D3430" />
      <stop offset="0.8306" stopColor="#7C3430" />
      <stop offset="0.8345" stopColor="#7C3430" />
      <stop offset="0.8384" stopColor="#7C3430" />
      <stop offset="0.8422" stopColor="#7B3430" />
      <stop offset="0.8461" stopColor="#7B3330" />
      <stop offset="0.85" stopColor="#7B3330" />
      <stop offset="0.8539" stopColor="#7A3331" />
      <stop offset="0.8578" stopColor="#7A3331" />
      <stop offset="0.8617" stopColor="#7A3331" />
      <stop offset="0.8656" stopColor="#793331" />
      <stop offset="0.8695" stopColor="#793331" />
      <stop offset="0.8734" stopColor="#783231" />
      <stop offset="0.8773" stopColor="#783231" />
      <stop offset="0.8812" stopColor="#783231" />
      <stop offset="0.885" stopColor="#773231" />
      <stop offset="0.8889" stopColor="#773231" />
      <stop offset="0.8928" stopColor="#773231" />
      <stop offset="0.8967" stopColor="#763231" />
      <stop offset="0.9006" stopColor="#763231" />
      <stop offset="0.9045" stopColor="#763131" />
      <stop offset="0.9084" stopColor="#753131" />
      <stop offset="0.9123" stopColor="#753132" />
      <stop offset="0.9161" stopColor="#753132" />
      <stop offset="0.92" stopColor="#743132" />
      <stop offset="0.9239" stopColor="#743132" />
      <stop offset="0.9278" stopColor="#733132" />
      <stop offset="0.9317" stopColor="#733032" />
      <stop offset="0.9356" stopColor="#733032" />
      <stop offset="0.9395" stopColor="#723032" />
      <stop offset="0.9434" stopColor="#723032" />
      <stop offset="0.9473" stopColor="#723032" />
      <stop offset="0.9512" stopColor="#713032" />
      <stop offset="0.955" stopColor="#713032" />
      <stop offset="0.9589" stopColor="#712F32" />
      <stop offset="0.9628" stopColor="#702F32" />
      <stop offset="0.9667" stopColor="#702F32" />
      <stop offset="0.9706" stopColor="#702F33" />
      <stop offset="0.9745" stopColor="#6F2F33" />
      <stop offset="0.9784" stopColor="#6F2F33" />
      <stop offset="0.9823" stopColor="#6E2F33" />
      <stop offset="0.9862" stopColor="#6E2E33" />
      <stop offset="1" stopColor="#6D2E33" />
    </linearGradient>
    <path
      fill={`url(#${id}-SVGID_1_)`}
      d="M37.55,126.98c-5.14,10.27-3.5,24.97,7.35,35.61c12.34,12.11,31.63,19.4,57.89,19.4  c26.35,0,45.63-7.52,57.43-19.4c11.59-11.65,12.02-26.81,7.29-35.96c-1.92-3.7-4.51-7.12-8.04-10.36c2.64,2.69,4.79,5.63,6.38,8.72  c0.06,0.11,0.11,0.26,0.17,0.37c0.23,0.46,0.46,0.95,0.66,1.43c0.98,2.27,1.63,4.59,1.95,6.95c0.72,5.22-0.23,10.36-2.9,15.41  c-1.64,3.07-3.9,6.11-6.86,9.01c-12.02,11.79-32.52,19.06-56.28,19.06c-22.33,0-41.73-6.4-53.99-16.93l0,0  c-0.8-0.69-1.58-1.41-2.3-2.12c-10.5-10.31-12.43-22.1-7.18-32.81c0.11-0.23,0.23-0.46,0.34-0.69c1.61-3.04,3.76-5.91,6.34-8.55  c0.03-0.03,0.08-0.08,0.11-0.12C42.61,119.28,39.96,122.15,37.55,126.98"
    />
    <path
      fill="#F36717"
      d="M139.89,103.64c-11.14-4.62-24.11-7-37.28-7c-13.17,0-26.15,2.38-37.28,7  c-12.2,5.05-21.64,12.57-26.15,21.73c-5.25,10.7-3.33,22.5,7.18,32.8c12.03,11.8,32.52,19.06,56.28,19.06  c23.76,0,44.26-7.26,56.28-19.06c10.5-10.3,12.43-22.1,7.15-32.8C161.5,116.21,152.09,108.7,139.89,103.64"
    />
    <linearGradient
      id={`${id}-SVGID_2_`}
      gradientUnits="userSpaceOnUse"
      x1="-555.066"
      y1="256.1931"
      x2="-552.5981"
      y2="256.1931"
      gradientTransform="matrix(45.2844 -7.9848 -7.9848 -45.2844 27205.0078 7306.6411)"
    >
      <stop offset="0" stopColor="#FDDB63" />
      <stop offset="3.460000e-03" stopColor="#FDDB63" />
      <stop offset="0.0112" stopColor="#FDDA62" />
      <stop offset="0.019" stopColor="#FDD962" />
      <stop offset="0.0267" stopColor="#FDD861" />
      <stop offset="0.0345" stopColor="#FDD761" />
      <stop offset="0.0422" stopColor="#FDD660" />
      <stop offset="0.05" stopColor="#FDD65F" />
      <stop offset="0.0578" stopColor="#FCD55F" />
      <stop offset="0.0655" stopColor="#FCD45E" />
      <stop offset="0.0733" stopColor="#FCD35E" />
      <stop offset="0.081" stopColor="#FCD25D" />
      <stop offset="0.0888" stopColor="#FCD15C" />
      <stop offset="0.0966" stopColor="#FCD05C" />
      <stop offset="0.1043" stopColor="#FCCF5B" />
      <stop offset="0.1121" stopColor="#FCCE5B" />
      <stop offset="0.1198" stopColor="#FCCD5A" />
      <stop offset="0.1276" stopColor="#FCCC5A" />
      <stop offset="0.1354" stopColor="#FCCC59" />
      <stop offset="0.1431" stopColor="#FCCB58" />
      <stop offset="0.1509" stopColor="#FCCA58" />
      <stop offset="0.1586" stopColor="#FBC957" />
      <stop offset="0.1664" stopColor="#FBC857" />
      <stop offset="0.1741" stopColor="#FBC756" />
      <stop offset="0.1819" stopColor="#FBC655" />
      <stop offset="0.1897" stopColor="#FBC555" />
      <stop offset="0.1974" stopColor="#FBC454" />
      <stop offset="0.2052" stopColor="#FBC354" />
      <stop offset="0.2129" stopColor="#FBC353" />
      <stop offset="0.2207" stopColor="#FBC252" />
      <stop offset="0.2285" stopColor="#FBC152" />
      <stop offset="0.2362" stopColor="#FBC051" />
      <stop offset="0.244" stopColor="#FBBF51" />
      <stop offset="0.2517" stopColor="#FBBE50" />
      <stop offset="0.2595" stopColor="#FABD4F" />
      <stop offset="0.2672" stopColor="#FABC4F" />
      <stop offset="0.275" stopColor="#FABB4E" />
      <stop offset="0.2828" stopColor="#FABA4E" />
      <stop offset="0.2905" stopColor="#FAB94D" />
      <stop offset="0.2983" stopColor="#FAB94C" />
      <stop offset="0.306" stopColor="#FAB84C" />
      <stop offset="0.3138" stopColor="#FAB74B" />
      <stop offset="0.3216" stopColor="#FAB64B" />
      <stop offset="0.3293" stopColor="#FAB54A" />
      <stop offset="0.3371" stopColor="#FAB449" />
      <stop offset="0.3448" stopColor="#FAB349" />
      <stop offset="0.3526" stopColor="#F9B248" />
      <stop offset="0.3604" stopColor="#F9B148" />
      <stop offset="0.3681" stopColor="#F9B047" />
      <stop offset="0.3759" stopColor="#F9AF47" />
      <stop offset="0.3836" stopColor="#F9AF46" />
      <stop offset="0.3914" stopColor="#F9AE45" />
      <stop offset="0.3991" stopColor="#F9AD45" />
      <stop offset="0.4069" stopColor="#F9AC44" />
      <stop offset="0.4147" stopColor="#F9AB44" />
      <stop offset="0.4224" stopColor="#F9AA43" />
      <stop offset="0.4302" stopColor="#F9A942" />
      <stop offset="0.4379" stopColor="#F9A842" />
      <stop offset="0.4457" stopColor="#F9A741" />
      <stop offset="0.4535" stopColor="#F8A641" />
      <stop offset="0.4612" stopColor="#F8A640" />
      <stop offset="0.469" stopColor="#F8A53F" />
      <stop offset="0.4767" stopColor="#F8A43F" />
      <stop offset="0.4845" stopColor="#F8A33E" />
      <stop offset="0.4922" stopColor="#F8A23E" />
      <stop offset="0.5" stopColor="#F8A13D" />
      <stop offset="0.5078" stopColor="#F8A03C" />
      <stop offset="0.5155" stopColor="#F89F3C" />
      <stop offset="0.5233" stopColor="#F89E3B" />
      <stop offset="0.531" stopColor="#F89D3B" />
      <stop offset="0.5388" stopColor="#F89C3A" />
      <stop offset="0.5465" stopColor="#F89C39" />
      <stop offset="0.5543" stopColor="#F79B39" />
      <stop offset="0.5621" stopColor="#F79A38" />
      <stop offset="0.5698" stopColor="#F79938" />
      <stop offset="0.5776" stopColor="#F79837" />
      <stop offset="0.5853" stopColor="#F79736" />
      <stop offset="0.5931" stopColor="#F79636" />
      <stop offset="0.6009" stopColor="#F79535" />
      <stop offset="0.6086" stopColor="#F79435" />
      <stop offset="0.6164" stopColor="#F79334" />
      <stop offset="0.6241" stopColor="#F79234" />
      <stop offset="0.6319" stopColor="#F79233" />
      <stop offset="0.6396" stopColor="#F79132" />
      <stop offset="0.6474" stopColor="#F79032" />
      <stop offset="0.6552" stopColor="#F68F31" />
      <stop offset="0.6629" stopColor="#F68E31" />
      <stop offset="0.6707" stopColor="#F68D30" />
      <stop offset="0.6784" stopColor="#F68C2F" />
      <stop offset="0.6862" stopColor="#F68B2F" />
      <stop offset="0.694" stopColor="#F68A2E" />
      <stop offset="0.7017" stopColor="#F6892E" />
      <stop offset="0.7095" stopColor="#F6892D" />
      <stop offset="0.7172" stopColor="#F6882C" />
      <stop offset="0.725" stopColor="#F6872C" />
      <stop offset="0.7328" stopColor="#F6862B" />
      <stop offset="0.7405" stopColor="#F6852B" />
      <stop offset="0.7483" stopColor="#F5842A" />
      <stop offset="0.756" stopColor="#F58329" />
      <stop offset="0.7638" stopColor="#F58229" />
      <stop offset="0.7715" stopColor="#F58128" />
      <stop offset="0.7793" stopColor="#F58028" />
      <stop offset="0.7871" stopColor="#F57F27" />
      <stop offset="0.7948" stopColor="#F57F26" />
      <stop offset="0.8026" stopColor="#F57E26" />
      <stop offset="0.8103" stopColor="#F57D25" />
      <stop offset="0.8181" stopColor="#F57C25" />
      <stop offset="0.8259" stopColor="#F57B24" />
      <stop offset="0.8336" stopColor="#F57A23" />
      <stop offset="0.8414" stopColor="#F57923" />
      <stop offset="0.8491" stopColor="#F47822" />
      <stop offset="0.8569" stopColor="#F47722" />
      <stop offset="0.8647" stopColor="#F47621" />
      <stop offset="0.8724" stopColor="#F47521" />
      <stop offset="0.8802" stopColor="#F47520" />
      <stop offset="0.8879" stopColor="#F4741F" />
      <stop offset="0.8957" stopColor="#F4731F" />
      <stop offset="0.9034" stopColor="#F4721E" />
      <stop offset="0.9112" stopColor="#F4711E" />
      <stop offset="0.919" stopColor="#F4701D" />
      <stop offset="0.9267" stopColor="#F46F1C" />
      <stop offset="0.9345" stopColor="#F46E1C" />
      <stop offset="0.9422" stopColor="#F46D1B" />
      <stop offset="0.95" stopColor="#F36C1B" />
      <stop offset="0.9578" stopColor="#F36C1A" />
      <stop offset="0.9655" stopColor="#F36B19" />
      <stop offset="0.9733" stopColor="#F36A19" />
      <stop offset="0.981" stopColor="#F36918" />
      <stop offset="0.9888" stopColor="#F36818" />
      <stop offset="0.9965" stopColor="#F36717" />
      <stop offset="1" stopColor="#F36717" />
    </linearGradient>
    <path
      fill={`url(#${id}-SVGID_2_)`}
      d="M104.91,126.69c0,0-1.06,0.29-2.24,0.6c0.08,2.76,0.17,5.57,0.26,8.38c1.86-2.9,3.18-5.91,3.96-9.01  c-0.26-0.03-0.55-0.03-0.8-0.03C105.69,126.63,105.28,126.66,104.91,126.69 M102.59,124.91c0,0.34,0.03,0.69,0.03,1.03  c0.32-0.46,0.63-0.86,0.95-1.24c-0.11-0.06-0.23-0.11-0.34-0.17C103.02,124.68,102.82,124.79,102.59,124.91 M102.59,124.19  c-12.46,0.2-22.3,0.78-34.55,1.81c10.76,0.03,19.11,0.43,30.05,1.29c-7.78,4.79-15.38,9.9-22.79,15.24  c7.69-4.34,15.53-8.44,23.48-12.26c-0.2-0.89-0.4-1.78-0.6-2.67l-0.06-0.32c1.49-0.92,3.01-1.84,4.5-2.76  C102.59,124.42,102.59,124.31,102.59,124.19C102.59,124.16,102.59,124.16,102.59,124.19C102.59,124.16,102.59,124.16,102.59,124.19   M102.59,124.19c0.11,0.06,0.2,0.11,0.31,0.18c-0.11,0.06-0.23,0.14-0.31,0.2c0.06-0.03,0.08-0.06,0.14-0.09l0.2-0.11  c0.11-0.06,0.23-0.15,0.34-0.2C103.02,124.16,102.82,124.16,102.59,124.19 M103.25,124.16L103.25,124.16 M103.25,124.16  c0.29,0,0.55,0,0.83,0c0.34-0.37,0.69-0.75,1.09-1.12C104.51,123.42,103.88,123.79,103.25,124.16 M107.53,118.68  c0,0.03,0.03,0.08,0.03,0.11C107.55,118.77,107.55,118.71,107.53,118.68L107.53,118.68 M93.49,121.78c1.55-0.17,3.13-0.34,4.68-0.49  c-6.28-3.5-12.71-6.77-19.29-9.67C83.91,114.78,88.75,118.19,93.49,121.78 M98.17,121.29c1.66,0.92,3.33,1.86,4.99,2.84  c0.03,0.03,0.06,0.03,0.08,0.06c0-6.14,0-12.28,0-18.46C101.38,110.85,99.72,116.07,98.17,121.29 M103.16,102.61L103.16,102.61  c-16.88,0-43.88,5.77-48.13,25.23c-0.72,3.27-0.66,6.26,0,8.98c2.41,8.61,10.99,14.52,20.78,18.25  c10.31-3.64,18.34-8.92,23.76-15.04c-0.54-2.44-1.09-4.88-1.66-7.35c-9.99,4.71-19.06,9.21-28.96,14.46  c7-6.95,13.63-12.94,21.15-19.31c-10.68-0.69-20.89-0.83-31.8-0.98c10.7-2.33,21.3-4.13,32.17-5.51  c-5.11-4.02-10.11-7.75-15.59-11.25l0,0l-0.83-0.52c8.24,2.09,16.05,4.59,24.02,7.52c1.58-4.71,3.24-9.39,5.14-13.98  C103.19,102.95,103.19,102.78,103.16,102.61z M65.31,103.64c-11.88,4.94-21.15,12.17-25.8,21.04c-0.11,0.23-0.23,0.46-0.34,0.69  c-5.28,10.7-3.33,22.5,7.18,32.8c0.75,0.72,1.49,1.44,2.3,2.12c8.9-0.52,16.96-1.98,24.02-4.16c-9.44-4.02-17.42-10.1-19.49-18.74  c-0.83-3.01-0.95-6.37-0.11-10.05c4.5-20.12,32.43-26.12,49.94-26.12c0.03,0,0.08,0,0.11,0c0-1.61,0.17-3.16,0.37-4.59  c-0.31,0-0.6,0-0.92,0C89.42,96.64,76.44,99.02,65.31,103.64"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#FFFFFF"
      d="M74.07,109.56c8.24,2.09,16.04,4.59,24.02,7.52  c1.58-4.74,3.24-9.44,5.17-14.03c1.92,4.62,3.59,9.3,5.17,14.03c7.95-2.93,15.64-5.34,23.88-7.4c-5.8,3.64-10.91,7.38-16.27,11.59  c10.88,1.38,21.07,3.19,31.77,5.51c-10.68-0.23-20.75,0.14-31.4,0.83c7.52,6.37,13.95,12.54,20.95,19.49  c-9.59-5.48-18.57-10.07-28.56-14.78c-1.92,8.35-3.76,16.73-5.54,25.11c-1.75-8.38-3.39-16.36-5.31-24.71  c-9.99,4.71-19.06,9.21-28.96,14.46c7-6.95,13.63-12.94,21.15-19.31c-10.68-0.69-20.89-0.83-31.8-0.98  c10.71-2.32,21.3-4.13,32.17-5.51C85.12,117.11,79.84,113.21,74.07,109.56 M103.26,124.17c0-6.14,0-12.28,0-18.45  c-1.87,5.14-3.53,10.33-5.08,15.56C99.88,122.22,101.57,123.2,103.26,124.17 M78.87,111.6c6.6,2.9,13,6.17,19.29,9.67  c-1.55,0.14-3.13,0.32-4.68,0.49C88.74,118.2,83.89,114.79,78.87,111.6 M103.26,124.17c12.71,0.03,25.4,0.66,38.03,1.92  c-11.11-2.01-21.87-3.53-32.98-4.82C106.59,122.22,104.93,123.17,103.26,124.17 M127.6,111.6c-6.6,2.9-13.03,6.17-19.31,9.67  c-0.26-0.86-0.52-1.72-0.77-2.58C114.11,116.05,120.83,113.67,127.6,111.6 M102.57,124.17c0.26,8.9,0.6,18.37,0.66,26.98  c1.66-7.98,3.39-15.93,5.22-23.88C106.73,126.21,104.32,125.18,102.57,124.17 M131.24,142.54c-7.4-5.34-14.98-10.45-22.76-15.27  c1.58-0.11,3.19-0.26,4.76-0.34C119.42,131.92,125.42,137.14,131.24,142.54 M103.26,124.17c-12.77,0.17-22.76,0.75-35.21,1.84  c10.76,0.03,19.11,0.43,30.05,1.29C99.79,126.24,101.51,125.2,103.26,124.17 M75.28,142.54c7.43-5.34,15.01-10.45,22.79-15.24  c0.23,1,0.46,1.98,0.69,2.98C90.78,134.1,82.97,138.21,75.28,142.54 M104.5,174.81c0-3.47,0-6.92-0.03-10.36  c-0.37-0.26-0.86-0.52-1.23-0.78c-0.37,0.26-0.92,0.52-1.29,0.78c0,3.44,0,6.92,0,10.36c0.4,0.26,0.92,0.55,1.29,0.83  C103.61,175.38,104.13,175.09,104.5,174.81 M42.99,149.74c-0.2,0.37-0.4,0.77-0.6,1.18c0.37,0.14,1.12,0.37,1.44,0.52  c3.62-1.92,7.2-3.87,10.76-5.74c0.14-0.55,0.23-0.86,0.37-1.26c-0.37-0.09-0.75-0.2-1.09-0.29  C50.22,145.96,46.6,147.82,42.99,149.74 M40.32,128.47c-0.34,0.26-0.66,0.52-1,0.8l0.55,0.75c3.39-0.49,6.77-0.89,10.16-1.23  c0.32-0.32,0.69-0.66,1-0.95l-0.6-0.6C47.06,127.58,43.7,127.98,40.32,128.47 M53.33,111.32c-0.34,0.14-0.69,0.29-1.03,0.43  l0.09,0.77c2.5,0.34,4.99,0.77,7.46,1.26c0.32-0.2,0.75-0.46,1.06-0.6l-0.14-0.66C58.3,112.07,55.8,111.67,53.33,111.32   M129.53,100.74c-1.32,0.83-2.61,1.69-3.9,2.53l0.37,0.43c0.34,0,0.66,0,1,0c1.26-0.89,2.53-1.75,3.85-2.58l-0.37-0.37  C130.16,100.74,129.84,100.74,129.53,100.74 M102.35,97.14c0,1.03,0,2.04-0.03,3.04l0.75,0.26l0.75-0.26c0-1-0.03-2.04-0.03-3.04  l-0.72-0.23L102.35,97.14 M75.07,101.2c1.32,0.83,2.58,1.69,3.85,2.61c0.32,0,0.8-0.09,1.12-0.09l0.37-0.43  c-1.26-0.89-2.55-1.72-3.87-2.55c-0.32,0-0.63,0-0.95,0L75.07,101.2 M67.12,168.48c2.53-3.04,5.11-6.06,7.66-9.04  c-0.14-0.29-0.37-0.8-0.49-1.12c-0.52,0.09-1.15,0.2-1.66,0.32c-2.61,2.98-5.17,6-7.69,9.01c0.11,0.37,0.37,0.72,0.49,1.09  C65.94,168.59,66.6,168.59,67.12,168.48 M162.65,149.74c-3.59-1.92-7.23-3.79-10.88-5.6c-0.34,0.09-0.72,0.2-1.09,0.29  c0.14,0.4,0.23,0.72,0.37,1.26c3.56,1.87,7.15,3.82,10.76,5.74c0.32-0.14,1.06-0.37,1.44-0.52  C163.05,150.52,162.85,150.12,162.65,149.74 M165.32,128.47c-3.36-0.49-6.74-0.89-10.1-1.23l-0.6,0.6c0.32,0.29,0.69,0.63,1,0.95  c3.39,0.34,6.77,0.75,10.16,1.23l0.55-0.75C165.98,128.98,165.66,128.72,165.32,128.47 M152.34,111.32  c-2.5,0.34-4.99,0.75-7.49,1.21l-0.11,0.66c0.32,0.14,0.75,0.4,1.06,0.6c2.47-0.49,4.97-0.92,7.46-1.26l0.11-0.77  C153.02,111.61,152.68,111.47,152.34,111.32 M138.52,168.48c0.43,0.06,1.18,0.17,1.69,0.26c0.17-0.34,0.32-0.72,0.49-1.09  c-2.53-3.01-5.08-6.03-7.69-9.01c-0.52-0.11-1.15-0.23-1.66-0.32c-0.11,0.32-0.34,0.83-0.49,1.12  C133.44,162.42,135.99,165.44,138.52,168.48"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#C4161D"
      d="M102.99,124.32l0.26-0.17v0.37c-1.72,1.03-3.42,2.04-5.11,3.07  l-0.06-0.32c1.55-0.95,3.1-1.89,4.65-2.81L102.99,124.32 M108.3,121.27c-0.26-0.86-0.52-1.72-0.77-2.58V119  c0.23,0.78,0.46,1.55,0.69,2.32L108.3,121.27"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#C82128"
      d="M103.25,103.36c1.92,4.62,3.59,9.3,5.17,14.03  c7.69-2.84,15.1-5.14,23.05-7.2l0.83-0.52c-8.24,2.1-15.9,4.48-23.88,7.4c-1.58-4.74-3.24-9.41-5.17-14.03  c-1.92,4.62-3.59,9.3-5.17,14.03c-7.95-2.93-15.78-5.42-24.02-7.52l0.83,0.52c7.95,2.07,15.5,4.48,23.19,7.32  C99.66,112.65,101.32,107.98,103.25,103.36"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#C95222"
      d="M42.95,150.34l-0.34,0.63l-0.23-0.09c0.2-0.4,0.4-0.77,0.6-1.18  c3.62-1.92,7.23-3.79,10.88-5.6c0.37,0.09,0.72,0.2,1.09,0.29l-0.2,0.63c-0.29-0.09-0.69-0.14-0.98-0.23  C50.13,146.61,46.57,148.42,42.95,150.34 M40.45,128.94c3.36-0.49,6.66-0.89,10.07-1.26l0.34,0.34l0.2-0.2l-0.6-0.6  c-3.39,0.34-6.74,0.78-10.13,1.26c-0.32,0.29-0.66,0.55-0.98,0.8l0.23,0.32L40.45,128.94 M53.38,111.92  c2.47,0.34,7.52,1.35,7.58,1.32l-0.14-0.66c-2.5-0.49-4.97-0.89-7.46-1.23c-0.34,0.14-0.69,0.29-1.03,0.43l0.06,0.52L53.38,111.92z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#A61B20"
      d="M108.45,127.27c7.81,4.79,15.38,9.93,22.76,15.27V143  c-9.76-7.03-17.48-12.08-22.79-15.35c-1.84,7.95-3.53,15.84-5.19,23.82v-0.32C104.87,143.26,106.65,135.1,108.45,127.27   M116.72,127.9l-0.34-0.29v0.49c7.26,6.14,13.06,11.65,19.8,18.34l1.15,0.66C130.23,140.04,123.89,133.98,116.72,127.9   M115.99,121.28v0.37c10.33,1.32,19.8,2.96,29.99,5.11c0.52,0,1.26,0.03,1.78,0.03C137.06,124.47,126.87,122.66,115.99,121.28   M103.25,124.15h0.52H103.25l0.26,0.17l0.32,0.17c12.54,0.03,25,0.66,37.45,1.92v-0.34C128.65,124.81,115.96,124.18,103.25,124.15   M108.3,121.27l0.46,0.06c6.14-3.39,12.43-6.57,18.86-9.41v-0.32C121.01,114.5,114.58,117.77,108.3,121.27 M130.48,101.28l0.06,0.06  l0.32-0.2l-0.37-0.37c-0.32,0-0.63,0-0.95,0c-1.32,0.83-2.61,1.66-3.87,2.55l0.29,0.32c1.18-0.8,2.38-1.61,3.59-2.35  C129.85,101.28,130.16,101.28,130.48,101.28 M74.24,158.75l0.46,0.86l0.14-0.14c-0.06-0.14-0.34-0.83-0.49-1.12  c-0.52,0.11-1.15,0.23-1.66,0.32c-2.58,2.98-5.17,5.97-7.69,9.01l0.2,0.43c1.64-1.92,5.14-6.14,7.69-9.07  C73.26,158.89,73.81,158.84,74.24,158.75 M162.71,150.34l0.34,0.63l0.23-0.09c-0.2-0.4-0.4-0.77-0.6-1.18  c-3.62-1.92-7.23-3.79-10.88-5.6c-0.37,0.09-0.75,0.2-1.09,0.29l0.2,0.63l0.98-0.23C155.51,146.61,159.09,148.42,162.71,150.34   M165.22,128.94l0.86,0.66l0.23-0.32c-0.32-0.26-0.66-0.52-0.98-0.8c-3.39-0.49-6.74-0.92-10.13-1.26l-0.6,0.6l0.2,0.2l0.34-0.34  C158.53,128.05,161.83,128.45,165.22,128.94 M153.29,112.29l0.06-0.52c-0.34-0.14-0.69-0.29-1.03-0.43  c-2.5,0.34-4.99,0.75-7.46,1.23l-0.14,0.66c0.06,0.03,5.11-0.98,7.58-1.32L153.29,112.29z M131.43,158.75  c0.4,0.09,0.98,0.14,1.35,0.32c2.55,2.93,6.08,7.12,7.72,9.04l0.17-0.43c-2.53-3.04-5.11-6.03-7.69-9.01  c-0.52-0.09-1.15-0.2-1.66-0.32c-0.14,0.29-0.43,0.98-0.49,1.12l0.14,0.14L131.43,158.75 M104.26,164.82l0.23,9.99l-0.03-10.36  c-0.37-0.26-0.86-0.52-1.23-0.77c-0.37,0.26-0.92,0.52-1.29,0.77v10.36l0.23-9.99c0.32-0.2,0.75-0.4,1.03-0.6L104.26,164.82z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#C93E25"
      d="M90.09,128.3c-7.29,6.14-13.26,11.54-20.03,18.22l-1.09,0.63  c6.89-6.83,13.72-13.03,21.12-19.31V128.3z M98.17,121.29l-0.49,0.06c-1.41,0.14-2.81,0.29-4.22,0.46c-4.74-3.59-9.59-7-14.61-10.19  v0.37c5.02,3.19,9.87,6.6,14.61,10.19c1.55-0.17,3.13-0.34,4.68-0.49c1.52,0.83,2.96,1.64,4.48,2.53h0.6  C101.58,123.21,99.83,122.21,98.17,121.29 M75.28,142.98c7.69-4.33,15.53-8.44,23.48-12.25v-0.43c-7.98,3.82-15.79,7.92-23.48,12.25  V142.98z M90.13,121.38c-10.76,1.38-21.24,3.19-31.83,5.45c0.52,0,1.15,0.03,1.69,0.03c10.19-2.15,20.15-3.85,30.48-5.17v-0.37  L90.13,121.38z M98.08,127.29c-10.02-0.86-19.98-1.35-30.02-1.29v0.32c9.9-0.09,19.75,0.4,29.62,1.26L98.08,127.29 M76.57,101.18  c1.21,0.75,2.38,1.61,3.56,2.41l0.29-0.32c-1.26-0.89-2.55-1.75-3.87-2.55c-0.32,0-0.63,0-0.95,0l-0.52,0.46l0.32,0.2l0.23-0.2  C75.94,101.18,76.25,101.18,76.57,101.18 M53.05,127.37c-5.6,25.05,31.83,34.41,49.97,34.41s55.56-9.36,49.94-34.41  c-4.53-20.12-32.46-26.12-49.97-26.12C85.48,101.25,57.55,107.22,53.05,127.37 M54.88,127.23c-5.25,24.08,30.68,32.98,48.13,32.98  c17.45,0,53.38-8.9,48.13-32.98C146.9,107.77,119.89,102,103.01,102C86.14,102,59.13,107.77,54.88,127.23"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#FFFFFF"
      d="M53.22,128c4.51-20.15,31.28-26.23,49.94-26.23  c18.63,0,45.43,6.08,49.94,26.23c5.63,25.05-31.8,34.38-49.94,34.38C85.02,162.38,47.59,153.05,53.22,128 M55.05,127.85  c4.25-19.46,31.25-25.23,48.13-25.23c16.85,0,43.88,5.77,48.13,25.23c5.25,24.08-30.68,32.98-48.13,32.98S49.8,151.9,55.05,127.85"
    />
    <linearGradient
      id={`${id}-SVGID_3_`}
      gradientUnits="userSpaceOnUse"
      x1="-555.066"
      y1="256.1569"
      x2="-552.5981"
      y2="256.1569"
      gradientTransform="matrix(45.2844 -7.9848 -7.9848 -45.2844 27205.0078 7306.6411)"
    >
      <stop offset="0" stopColor="#996F5B" />
      <stop offset="3.460000e-03" stopColor="#996F5B" />
      <stop offset="0.0112" stopColor="#996F5B" />
      <stop offset="0.019" stopColor="#996E5A" />
      <stop offset="0.0267" stopColor="#996E5A" />
      <stop offset="0.0345" stopColor="#996D5A" />
      <stop offset="0.0422" stopColor="#996D5A" />
      <stop offset="0.05" stopColor="#996D59" />
      <stop offset="0.0578" stopColor="#996C59" />
      <stop offset="0.0655" stopColor="#996C59" />
      <stop offset="0.0733" stopColor="#996C59" />
      <stop offset="0.081" stopColor="#996B58" />
      <stop offset="0.0888" stopColor="#996B58" />
      <stop offset="0.0966" stopColor="#996A58" />
      <stop offset="0.1043" stopColor="#996A58" />
      <stop offset="0.1121" stopColor="#996A57" />
      <stop offset="0.1198" stopColor="#996957" />
      <stop offset="0.1276" stopColor="#996957" />
      <stop offset="0.1354" stopColor="#996956" />
      <stop offset="0.1431" stopColor="#996856" />
      <stop offset="0.1509" stopColor="#996856" />
      <stop offset="0.1586" stopColor="#996756" />
      <stop offset="0.1664" stopColor="#996755" />
      <stop offset="0.1741" stopColor="#9A6755" />
      <stop offset="0.1819" stopColor="#9A6655" />
      <stop offset="0.1897" stopColor="#9A6655" />
      <stop offset="0.1974" stopColor="#9A6654" />
      <stop offset="0.2052" stopColor="#9A6554" />
      <stop offset="0.2129" stopColor="#9A6554" />
      <stop offset="0.2207" stopColor="#9A6454" />
      <stop offset="0.2285" stopColor="#9A6453" />
      <stop offset="0.2362" stopColor="#9A6453" />
      <stop offset="0.244" stopColor="#9A6353" />
      <stop offset="0.2517" stopColor="#9A6352" />
      <stop offset="0.2595" stopColor="#9A6352" />
      <stop offset="0.2672" stopColor="#9A6252" />
      <stop offset="0.275" stopColor="#9A6252" />
      <stop offset="0.2828" stopColor="#9A6151" />
      <stop offset="0.2905" stopColor="#9A6151" />
      <stop offset="0.2983" stopColor="#9A6151" />
      <stop offset="0.306" stopColor="#9A6051" />
      <stop offset="0.3138" stopColor="#9A6050" />
      <stop offset="0.3216" stopColor="#9A6050" />
      <stop offset="0.3293" stopColor="#9A5F50" />
      <stop offset="0.3371" stopColor="#9A5F50" />
      <stop offset="0.3448" stopColor="#9A5E4F" />
      <stop offset="0.3526" stopColor="#9A5E4F" />
      <stop offset="0.3604" stopColor="#9A5E4F" />
      <stop offset="0.3681" stopColor="#9A5D4F" />
      <stop offset="0.3759" stopColor="#9A5D4E" />
      <stop offset="0.3836" stopColor="#9A5D4E" />
      <stop offset="0.3914" stopColor="#9A5C4E" />
      <stop offset="0.3991" stopColor="#9A5C4D" />
      <stop offset="0.4069" stopColor="#9A5B4D" />
      <stop offset="0.4147" stopColor="#9A5B4D" />
      <stop offset="0.4224" stopColor="#9A5B4D" />
      <stop offset="0.4302" stopColor="#9A5A4C" />
      <stop offset="0.4379" stopColor="#9A5A4C" />
      <stop offset="0.4457" stopColor="#9A5A4C" />
      <stop offset="0.4535" stopColor="#9A594C" />
      <stop offset="0.4612" stopColor="#9A594B" />
      <stop offset="0.469" stopColor="#9A584B" />
      <stop offset="0.4767" stopColor="#9A584B" />
      <stop offset="0.4845" stopColor="#9A584B" />
      <stop offset="0.4922" stopColor="#9A574A" />
      <stop offset="0.5" stopColor="#9A574A" />
      <stop offset="0.5078" stopColor="#9B574A" />
      <stop offset="0.5155" stopColor="#9B5649" />
      <stop offset="0.5233" stopColor="#9B5649" />
      <stop offset="0.531" stopColor="#9B5549" />
      <stop offset="0.5388" stopColor="#9B5549" />
      <stop offset="0.5465" stopColor="#9B5548" />
      <stop offset="0.5543" stopColor="#9B5448" />
      <stop offset="0.5621" stopColor="#9B5448" />
      <stop offset="0.5698" stopColor="#9B5448" />
      <stop offset="0.5776" stopColor="#9B5347" />
      <stop offset="0.5853" stopColor="#9B5347" />
      <stop offset="0.5931" stopColor="#9B5247" />
      <stop offset="0.6009" stopColor="#9B5247" />
      <stop offset="0.6086" stopColor="#9B5246" />
      <stop offset="0.6164" stopColor="#9B5146" />
      <stop offset="0.6241" stopColor="#9B5146" />
      <stop offset="0.6319" stopColor="#9B5145" />
      <stop offset="0.6396" stopColor="#9B5045" />
      <stop offset="0.6474" stopColor="#9B5045" />
      <stop offset="0.6552" stopColor="#9B4F45" />
      <stop offset="0.6629" stopColor="#9B4F44" />
      <stop offset="0.6707" stopColor="#9B4F44" />
      <stop offset="0.6784" stopColor="#9B4E44" />
      <stop offset="0.6862" stopColor="#9B4E44" />
      <stop offset="0.694" stopColor="#9B4E43" />
      <stop offset="0.7017" stopColor="#9B4D43" />
      <stop offset="0.7095" stopColor="#9B4D43" />
      <stop offset="0.7172" stopColor="#9B4C43" />
      <stop offset="0.725" stopColor="#9B4C42" />
      <stop offset="0.7328" stopColor="#9B4C42" />
      <stop offset="0.7405" stopColor="#9B4B42" />
      <stop offset="0.7483" stopColor="#9B4B41" />
      <stop offset="0.756" stopColor="#9B4B41" />
      <stop offset="0.7638" stopColor="#9B4A41" />
      <stop offset="0.7715" stopColor="#9B4A41" />
      <stop offset="0.7793" stopColor="#9B4A40" />
      <stop offset="0.7871" stopColor="#9B4940" />
      <stop offset="0.7948" stopColor="#9B4940" />
      <stop offset="0.8026" stopColor="#9B4840" />
      <stop offset="0.8103" stopColor="#9B483F" />
      <stop offset="0.8181" stopColor="#9B483F" />
      <stop offset="0.8259" stopColor="#9B473F" />
      <stop offset="0.8336" stopColor="#9C473F" />
      <stop offset="0.8414" stopColor="#9C473E" />
      <stop offset="0.8491" stopColor="#9C463E" />
      <stop offset="0.8569" stopColor="#9C463E" />
      <stop offset="0.8647" stopColor="#9C453E" />
      <stop offset="0.8724" stopColor="#9C453D" />
      <stop offset="0.8802" stopColor="#9C453D" />
      <stop offset="0.8879" stopColor="#9C443D" />
      <stop offset="0.8957" stopColor="#9C443C" />
      <stop offset="0.9034" stopColor="#9C443C" />
      <stop offset="0.9112" stopColor="#9C433C" />
      <stop offset="0.919" stopColor="#9C433C" />
      <stop offset="0.9267" stopColor="#9C423B" />
      <stop offset="0.9345" stopColor="#9C423B" />
      <stop offset="0.9422" stopColor="#9C423B" />
      <stop offset="0.95" stopColor="#9C413B" />
      <stop offset="0.9578" stopColor="#9C413A" />
      <stop offset="0.9655" stopColor="#9C413A" />
      <stop offset="0.9733" stopColor="#9C403A" />
      <stop offset="0.981" stopColor="#9C403A" />
      <stop offset="0.9888" stopColor="#9C3F39" />
      <stop offset="0.9965" stopColor="#9C3F39" />
      <stop offset="1" stopColor="#9C3F39" />
    </linearGradient>
    <path
      fill={`url(#${id}-SVGID_3_)`}
      d="M102.64,125.97c0,0.43,0.03,0.89,0.03,1.32c1.17-0.31,2.24-0.6,2.24-0.6  c0.37-0.06,0.75-0.06,1.15-0.06c0.26,0,0.54,0,0.8,0.03c0.03-0.08,0.03-0.14,0.06-0.23c-1.09-0.57-2.3-1.15-3.36-1.69  C103.28,125.11,102.96,125.51,102.64,125.97 M105.14,123.04c-0.38,0.37-0.75,0.75-1.09,1.12c1.09,0,2.18,0.03,3.27,0.03  c0.11-0.83,0.2-1.7,0.23-2.56C106.78,122.13,105.97,122.59,105.14,123.04"
    />
    <path
      fill="#8A223A"
      d="M124.01,112.22c-0.23-0.06-0.43-0.12-0.6-0.14c2.9-0.86,5.85-1.66,8.87-2.44l-0.83,0.52c0,0,0,0-0.03,0  C128.92,110.85,126.45,111.53,124.01,112.22"
    />
    <path
      fill="#7C1E33"
      d="M155.8,146.16c-0.66-0.32-1.26-0.63-1.78-0.89C154.62,145.56,155.2,145.85,155.8,146.16 M118.96,129.81  c-0.75-0.63-1.49-1.29-2.21-1.89l-0.34-0.29v0.49c0.55,0.49,1.09,0.95,1.64,1.41C118.33,129.61,118.64,129.7,118.96,129.81   M147.78,126.77c-3.85-0.83-7.63-1.58-11.37-2.3c0.09,0.11,0.17,0.26,0.26,0.4c3.07,0.57,6.17,1.21,9.33,1.87l0,0  C146.52,126.74,147.26,126.77,147.78,126.77 M125.94,125.2c-0.63-0.17-1.38-0.34-2.18-0.46c-6.54-0.37-13.12-0.55-19.66-0.57  c-0.11,0.11-0.2,0.2-0.29,0.32l0.03,0.03C111.21,124.54,118.59,124.77,125.94,125.2 M141.26,126.44v-0.34  c-1.32-0.11-2.67-0.26-4.02-0.37c0.09,0.12,0.17,0.26,0.26,0.37C138.76,126.18,140,126.32,141.26,126.44 M125.86,112.68  c0.57-0.26,1.15-0.52,1.72-0.77v-0.32c-0.72,0.32-1.46,0.63-2.18,0.98C125.6,112.62,125.75,112.65,125.86,112.68"
    />
    <path
      fill="#9C3F39"
      d="M165.18,150.21c-1.64-0.55-6.08-2.44-9.36-4.05c-0.6-0.32-1.18-0.6-1.78-0.89  c-0.89-0.46-1.55-0.86-1.87-1.15c0,0-0.6-0.32-1.49-0.8c2.3-3.62,3.44-7.81,2.9-12.66l1.03,0.23l8.18,1.23l5.77,1.21  c0.03,0.14,0.03,0.26,0.06,0.4c0.14,1.09,0.23,2.18,0.23,3.27c0,4.08-1,8.15-3.13,12.14C165.56,149.52,165.38,149.87,165.18,150.21   M125.4,112.59c0.75-0.34,1.46-0.69,2.18-1l0,0c-0.92,0.29-1.81,0.57-2.73,0.86C125.05,112.51,125.23,112.56,125.4,112.59   M123.71,124.73c-0.66-0.09-1.41-0.17-2.21-0.23c-7.86-0.69-10.88-1.75-11.65-2.01c-1.41-0.49-1.43-0.75-2.27-0.86  c-0.03,0.86-0.11,1.72-0.23,2.55C112.8,124.27,118.25,124.45,123.71,124.73 M141.27,126.08c-1.43-0.26-2.87-0.52-4.28-0.75  c0.09,0.11,0.17,0.26,0.26,0.37C138.57,125.82,139.92,125.94,141.27,126.08 M107.46,126.68c-0.17-0.09-0.34-0.17-0.52-0.29  c-0.03,0.09-0.03,0.14-0.06,0.23C107.09,126.66,107.26,126.66,107.46,126.68 M115.3,128.58c-0.69-0.55-1.38-1.09-2.04-1.66  c-1.03,0.06-2.04,0.11-3.04,0.2c1.03,0.23,1.72,0.43,1.72,0.43C112.97,127.78,114.41,128.26,115.3,128.58 M148.5,142.21  c2.32-3.53,3.5-7.63,3.01-12.37c-1.18-0.66-2.44-1.64-3.16-2.73c-1.12-1.75-3.87-4.79-5.4-6.69c-2.1-2.61-6.86-5.02-7.55-6.11  c-0.69-1.09-1.84-2.98-2.15-3.73c-0.32-0.72-0.98-1.29-2.09-1.29c-0.06,0-0.14,0-0.2,0c-1.26,0.09-1.35,0.52-2.41,0.57  c-0.14,0-0.29,0-0.43,0c-1,0-2.12-0.17-2.12-0.17c-0.66-0.11-1.09-0.2-1.55-0.2c-0.63,1.09-1.64,1.75-4.08,1.75l-0.43-0.06  c0.23,0.52,2.35,0.83,2.84,0.83c0.03,0,0.03,0,0.06,0h0.03c0.11,0,0.29,0.03,0.52,0.09c2.9-0.86,5.85-1.66,8.87-2.44l-0.83,0.52  c-0.03,0-0.03,0-0.03,0c-1.41,0.89-2.78,1.81-4.13,2.73c0.23,0.11,0.55,0.26,0.98,0.52c2.64,1.49,6.54,5.65,7.32,9.27  c0.11,0.52,0.43,1.12,0.83,1.75c3.76,0.69,7.55,1.46,11.39,2.3c-0.52,0-1.26-0.03-1.78-0.03c-1.52-0.03-3.04-0.03-4.56-0.03  c-1.18,0-2.3,0.03-3.44,0.03c0.86,1.15,1.66,2.27,1.84,3.1c-3.47-0.23-7.81-2.04-9.7-2.9c-4.53,0.14-9.07,0.4-13.75,0.69  c0.86,0.75,1.72,1.49,2.55,2.21c3.53,1.15,9.24,3.16,11.11,4.51c1.81,1.32,11.14,4.79,13.6,5.65  C144.8,140.37,146.75,141.32,148.5,142.21 M167.02,127.66c-0.11-0.29-0.2-0.57-0.37-0.8c-0.2-0.49-0.43-0.95-0.66-1.43  c0-0.03-0.03-0.03-0.03-0.06v-0.03c0-0.03,0-0.03,0-0.03c-0.06-0.09-0.09-0.2-0.14-0.29c-0.29-0.6-0.63-1.21-0.98-1.78  c-0.11-0.03-1.52-0.43-5.08-0.43c-0.34,0-0.72,0-1.09,0c-0.03,0-0.03,0-0.06,0c-0.77,0-1.64,0.2-1.64,0.2l-2.24,1.32  c-0.29,0.46,0.72,1.06,0.72,1.06s2.81,0.17,2.81,0.92C160.33,127.43,164.75,127.55,167.02,127.66 M138.2,151.34  c0.86-0.49,1.69-1.03,2.53-1.58c-0.49-0.09-1.18-0.17-2.1-0.17C137.83,149.59,137.88,150.42,138.2,151.34 M157.86,159.15  c0.34-0.32,0.66-0.63,1.03-0.92c1.29-1.26,2.41-2.53,3.44-3.82c-4.97-0.11-12.03-0.2-17.39-2.98c-0.17-0.55-0.57-0.83-1-1  c-1.46,1.12-3.04,2.12-4.74,3.07c0.14,0.23,0.23,0.4,0.23,0.4c1.64,1.09,7.52,2.76,8.75,2.93c1.23,0.14,5.34,1.38,5.34,1.38  S155.65,158.49,157.86,159.15"
    />
    <path
      fill="#892F3B"
      d="M148.93,142.43c-0.14-0.06-0.29-0.14-0.43-0.2c2.32-3.53,3.5-7.61,3.04-12.34c0.03,0.03,0.06,0.03,0.09,0.06  C152.26,134.68,151.17,138.84,148.93,142.43 M138.42,151.94c1.06-0.63,2.07-1.26,3.04-1.95c-0.17-0.06-0.43-0.14-0.75-0.2  c-0.8,0.55-1.66,1.06-2.53,1.58C138.28,151.54,138.34,151.74,138.42,151.94"
    />
    <path
      fill="#987A8F"
      d="M127.28,112.94c-0.6-0.26-0.69-0.11-1.41-0.23h-0.03c0.57-0.26,1.15-0.52,1.75-0.77v-0.32  c-0.92,0.29-1.84,0.57-2.73,0.86c-0.29-0.06-0.57-0.14-0.86-0.2c2.44-0.72,4.91-1.38,7.43-2.04  C130.01,111.1,128.63,112.02,127.28,112.94 M105.15,123.04c0.2-0.17,0.37-0.37,0.6-0.57c0.32-0.29,0.52-0.6,0.69-0.89l0.72,0.03  c0.17,0,0.32,0.03,0.46,0.03C106.76,122.12,105.96,122.58,105.15,123.04 M146,126.74c-1.52-0.03-3.04-0.03-4.56-0.03  c-1.15,0-2.3,0-3.42,0.03c-0.17-0.23-0.32-0.43-0.49-0.66c1.26,0.11,2.5,0.23,3.76,0.34v-0.34c-1.35-0.14-2.7-0.26-4.02-0.37  c1.35,0.11,2.7,0.26,4.02,0.37c-1.44-0.26-2.87-0.52-4.31-0.75c-0.11-0.14-0.2-0.32-0.32-0.46  C139.74,125.45,142.84,126.08,146,126.74 M147.77,126.77L147.77,126.77c-3.85-0.83-7.63-1.61-11.39-2.3  C140.17,125.19,143.93,125.94,147.77,126.77 M100.48,127.83c0.66-0.17,1.23-0.49,1.55-1c0.2-0.32,0.4-0.6,0.57-0.86  c0,0.46,0.03,0.89,0.03,1.32C101.91,127.49,101.08,127.69,100.48,127.83 M118.96,129.81L118.96,129.81  c-0.75-0.63-1.46-1.26-2.21-1.89l-0.34-0.29v0.49c0.55,0.46,1.09,0.95,1.64,1.41c-1.18-0.37-1.95-0.63-1.95-0.63  s-0.32-0.11-0.77-0.29c-0.69-0.57-1.35-1.12-2.04-1.66c-1,0.06-2.04,0.14-3.04,0.2c-0.77-0.17-1.75-0.34-2.76-0.43  c-0.17-0.09-0.34-0.17-0.52-0.29c-1.09-0.57-2.3-1.15-3.36-1.69c0.06-0.09,0.14-0.17,0.2-0.23l0.03,0.03  c7.38,0.03,14.75,0.26,22.1,0.69c1.58,0.43,2.47,0.89,2.47,0.89l0.77,0.37c0,0,0.37,0.17,0.98,0.46c-4.53,0.14-9.1,0.4-13.75,0.69  C117.27,128.35,118.1,129.07,118.96,129.81 M150.65,143.31c2.3-3.62,3.44-7.81,2.93-12.66h-0.03c-0.52-0.11-1.18-0.37-1.89-0.75  c0.6,4.79-0.49,8.95-2.73,12.51C149.56,142.73,150.16,143.05,150.65,143.31 M165.99,125.31L165.99,125.31 M166.02,125.37  c0-0.03-0.03-0.03-0.03-0.06C166.02,125.34,166.02,125.37,166.02,125.37 M139.18,153.47c1.66-0.95,3.27-1.95,4.76-3.07  c-0.37-0.14-0.77-0.17-1.12-0.17c-0.43,0-0.77,0.06-0.77,0.06s-0.11-0.14-0.55-0.32c-0.98,0.69-2.01,1.32-3.07,1.95  C138.66,152.52,138.98,153.1,139.18,153.47"
    />
    <path
      fill="#F9A93F"
      d="M126.9,72.17l-1.69-1.58c-0.11-0.52,0.46-1.23,0.6-2.12l-0.52-0.2c-0.4-1.52-0.75-4.28,0-5.74  c0.34-0.72,0.77-1.66,0.55-2.5c-1.38-4.68-4.08-8.75-5.97-13.17c-0.52-1.21-0.43-2.07-0.52-3.3c-1.46-1.64-3.19-5.88-3.99-8.5  c-1.72,4.33-2.87,9.33-2.87,10.48c0,4.88,4.97,7.26,3.24,15.38c-0.34,1.58-0.92,3.73-1.49,5.97c1.03,5.65,1.03,9.76,2.55,16.33  c2.12,2.09,3.87,4.79,4.82,8.21c0.57,2.12,2.35,7.09,4.65,7.81c1.41,0.46-4.79,1.61-6.54-0.6c-1.69-2.12-4.62-3.82-6-6.06  c-1.09-1.78-2.81-5.63-3.9-7.43l-1.32,6.95c1.81,7.43,0.72,9.07-0.89,15.1c-0.69,2.61-5.94-9.59-5.97-10.53  c0-2.64-0.17-3.62-0.77-5.97c-1.09-2.15-0.98-5.19-0.83-7.52c0.26-3.87,0.23-11.16,0.37-13.09c-1.32-3.27-4.74-9.16-5.08-12.46  c-0.52-5.17,0.34-10.39-0.37-15.56c-0.89,2.58-1.84,5.85-3.85,7.84c-3.01,2.96-5.77,6.23-8.47,9.5c-0.98,1.35-0.11,1.98-1.64,4.13  c-1.49,2.09-0.69,1.15-1,3.16c-0.06,0.34-0.23,0.63-0.34,0.75c-0.8,0.66-1.64,1.23-2.78,0.77c-2.21-1.12-2.38-2.76-2.53-4.85  c-0.29-4.02,2.7-4.22,4.39-6.66c3.3-4.79,4.99-12.83,8.55-16.44c0.23-0.72,1.06-3.3,2.64-7.12c0.06-4.76,1.23-9.01,6.14-10.96  c2.01-0.8,4.65-1,4.74-3.79c0-0.34-0.06-1.18-0.26-1.49c-0.8-0.66-1.38-0.66-1.78-1.12c-0.8-1.03-1.46-7.58-1.38-8.01  c1.15-5.57,3.82-7.4,7.18-7.26c3.99,0.2,7.15,2.12,6.97,7.46c-0.14,4.31-4.59,9.84,2.07,11.94c2.55,0.8,3.01,0.26,5.22,2.44  c2.44,2.47,3.04,6.83,3.44,10.88l2.5,5.8c4.59,7.72,2.93,10.16,4.59,17.99c0.43,2.04,1.18,3.82,1.35,8.27  C130.89,67.35,129.22,72.09,126.9,72.17"
    />
    <linearGradient
      id={`${id}-SVGID_4_`}
      gradientUnits="userSpaceOnUse"
      x1="-564.7075"
      y1="262.6658"
      x2="-562.2404"
      y2="262.6658"
      gradientTransform="matrix(26.2212 26.2212 26.2212 -26.2212 8000.6489 21739.6152)"
    >
      <stop offset="0" stopColor="#2C3696" />
      <stop offset="4.280000e-03" stopColor="#2C3696" />
      <stop offset="0.012" stopColor="#2C3696" />
      <stop offset="0.0198" stopColor="#2C3696" />
      <stop offset="0.0275" stopColor="#2C3695" />
      <stop offset="0.0353" stopColor="#2C3695" />
      <stop offset="0.043" stopColor="#2C3695" />
      <stop offset="0.0507" stopColor="#2C3595" />
      <stop offset="0.0585" stopColor="#2C3594" />
      <stop offset="0.0662" stopColor="#2B3594" />
      <stop offset="0.074" stopColor="#2B3594" />
      <stop offset="0.0817" stopColor="#2B3594" />
      <stop offset="0.0895" stopColor="#2B3593" />
      <stop offset="0.0972" stopColor="#2B3593" />
      <stop offset="0.105" stopColor="#2B3593" />
      <stop offset="0.1127" stopColor="#2B3593" />
      <stop offset="0.1205" stopColor="#2B3592" />
      <stop offset="0.1282" stopColor="#2B3592" />
      <stop offset="0.1359" stopColor="#2B3592" />
      <stop offset="0.1437" stopColor="#2B3492" />
      <stop offset="0.1514" stopColor="#2B3492" />
      <stop offset="0.1592" stopColor="#2B3491" />
      <stop offset="0.1669" stopColor="#2B3491" />
      <stop offset="0.1747" stopColor="#2A3491" />
      <stop offset="0.1824" stopColor="#2A3491" />
      <stop offset="0.1902" stopColor="#2A3490" />
      <stop offset="0.1979" stopColor="#2A3490" />
      <stop offset="0.2057" stopColor="#2A3490" />
      <stop offset="0.2134" stopColor="#2A3490" />
      <stop offset="0.2212" stopColor="#2A348F" />
      <stop offset="0.2289" stopColor="#2A348F" />
      <stop offset="0.2367" stopColor="#2A338F" />
      <stop offset="0.2444" stopColor="#2A338F" />
      <stop offset="0.2521" stopColor="#2A338F" />
      <stop offset="0.2599" stopColor="#2A338E" />
      <stop offset="0.2676" stopColor="#2A338E" />
      <stop offset="0.2754" stopColor="#2A338E" />
      <stop offset="0.2831" stopColor="#29338E" />
      <stop offset="0.2909" stopColor="#29338D" />
      <stop offset="0.2986" stopColor="#29338D" />
      <stop offset="0.3064" stopColor="#29338D" />
      <stop offset="0.3141" stopColor="#29338D" />
      <stop offset="0.3219" stopColor="#29328C" />
      <stop offset="0.3296" stopColor="#29328C" />
      <stop offset="0.3373" stopColor="#29328C" />
      <stop offset="0.3451" stopColor="#29328C" />
      <stop offset="0.3528" stopColor="#29328B" />
      <stop offset="0.3606" stopColor="#29328B" />
      <stop offset="0.3683" stopColor="#29328B" />
      <stop offset="0.3761" stopColor="#29328B" />
      <stop offset="0.3838" stopColor="#29328B" />
      <stop offset="0.3916" stopColor="#28328A" />
      <stop offset="0.3993" stopColor="#28328A" />
      <stop offset="0.4071" stopColor="#28328A" />
      <stop offset="0.4148" stopColor="#28318A" />
      <stop offset="0.4225" stopColor="#283189" />
      <stop offset="0.4303" stopColor="#283189" />
      <stop offset="0.438" stopColor="#283189" />
      <stop offset="0.4458" stopColor="#283189" />
      <stop offset="0.4535" stopColor="#283188" />
      <stop offset="0.4613" stopColor="#283188" />
      <stop offset="0.469" stopColor="#283188" />
      <stop offset="0.4768" stopColor="#283188" />
      <stop offset="0.4845" stopColor="#283187" />
      <stop offset="0.4922" stopColor="#283187" />
      <stop offset="0.5" stopColor="#273087" />
      <stop offset="0.5077" stopColor="#273087" />
      <stop offset="0.5155" stopColor="#273087" />
      <stop offset="0.5232" stopColor="#273086" />
      <stop offset="0.531" stopColor="#273086" />
      <stop offset="0.5387" stopColor="#273086" />
      <stop offset="0.5465" stopColor="#273086" />
      <stop offset="0.5542" stopColor="#273085" />
      <stop offset="0.562" stopColor="#273085" />
      <stop offset="0.5697" stopColor="#273085" />
      <stop offset="0.5775" stopColor="#273085" />
      <stop offset="0.5852" stopColor="#273084" />
      <stop offset="0.5929" stopColor="#272F84" />
      <stop offset="0.6007" stopColor="#272F84" />
      <stop offset="0.6084" stopColor="#272F84" />
      <stop offset="0.6162" stopColor="#262F83" />
      <stop offset="0.6239" stopColor="#262F83" />
      <stop offset="0.6317" stopColor="#262F83" />
      <stop offset="0.6394" stopColor="#262F83" />
      <stop offset="0.6472" stopColor="#262F83" />
      <stop offset="0.6549" stopColor="#262F82" />
      <stop offset="0.6627" stopColor="#262F82" />
      <stop offset="0.6704" stopColor="#262F82" />
      <stop offset="0.6781" stopColor="#262F82" />
      <stop offset="0.6859" stopColor="#262E81" />
      <stop offset="0.6936" stopColor="#262E81" />
      <stop offset="0.7014" stopColor="#262E81" />
      <stop offset="0.7091" stopColor="#262E81" />
      <stop offset="0.7169" stopColor="#262E80" />
      <stop offset="0.7246" stopColor="#252E80" />
      <stop offset="0.7324" stopColor="#252E80" />
      <stop offset="0.7401" stopColor="#252E80" />
      <stop offset="0.7479" stopColor="#252E80" />
      <stop offset="0.7556" stopColor="#252E7F" />
      <stop offset="0.7634" stopColor="#252E7F" />
      <stop offset="0.7711" stopColor="#252D7F" />
      <stop offset="0.7788" stopColor="#252D7F" />
      <stop offset="0.7866" stopColor="#252D7E" />
      <stop offset="0.7943" stopColor="#252D7E" />
      <stop offset="0.8021" stopColor="#252D7E" />
      <stop offset="0.8098" stopColor="#252D7E" />
      <stop offset="0.8176" stopColor="#252D7D" />
      <stop offset="0.8253" stopColor="#252D7D" />
      <stop offset="0.8331" stopColor="#242D7D" />
      <stop offset="0.8408" stopColor="#242D7D" />
      <stop offset="0.8486" stopColor="#242D7C" />
      <stop offset="0.8563" stopColor="#242D7C" />
      <stop offset="0.864" stopColor="#242C7C" />
      <stop offset="0.8718" stopColor="#242C7C" />
      <stop offset="0.8795" stopColor="#242C7C" />
      <stop offset="0.8873" stopColor="#242C7B" />
      <stop offset="0.895" stopColor="#242C7B" />
      <stop offset="0.9028" stopColor="#242C7B" />
      <stop offset="0.9105" stopColor="#242C7B" />
      <stop offset="0.9183" stopColor="#242C7A" />
      <stop offset="0.926" stopColor="#242C7A" />
      <stop offset="0.9338" stopColor="#242C7A" />
      <stop offset="0.9415" stopColor="#232C7A" />
      <stop offset="0.9492" stopColor="#232C79" />
      <stop offset="0.957" stopColor="#232B79" />
      <stop offset="0.9647" stopColor="#232B79" />
      <stop offset="0.9725" stopColor="#232B79" />
      <stop offset="0.9802" stopColor="#232B78" />
      <stop offset="0.988" stopColor="#232B78" />
      <stop offset="0.9957" stopColor="#232B78" />
      <stop offset="1" stopColor="#232B78" />
    </linearGradient>
    <path
      fill={`url(#${id}-SVGID_4_)`}
      d="M99.29,7.96c0.03,0.34,0.2,5.63,0.98,6.75c1.52,1.15,2.38,0.8,2.3,3.65  c-0.08,2.38-1.61,3.79-3.67,4.53c-3.36,1.17-5.08,1.86-6.2,5.34c-0.34,1.09-0.66,2.67-0.66,4.99v0.15c-0.95,2.38-2.18,5.11-2.9,7.66  c-4.13,4.16-6.2,13.57-10.39,17.56c-2.78,2.64-3.62,2.81-2.61,6.89c0.11,0.4,1.43,1.47,1.72,1.64l1.29-0.8  c0.2-2.07-0.08-1.89,1.24-3.79c1.21-1.75,0.63-2.67,1.69-4.19c2.64-3.3,5.14-6.63,8.09-9.64c1.98-2.01,4.68-8.81,5.31-11.19  c0.11-0.34,0.31-0.52,0.4-0.23c0.4,4.53,1.06,8.32,0.89,12.8c-0.34,9.39-0.08,8.41,3.82,17.16c0.31-3.53,1.17-8.64,3.21-10.36  c-2.41,9.13-2.56,22.16-2.81,26.14c-0.15,2.04-0.69,5.25,0.29,7.12c0.31,1.26,0.34,3.18,0.37,4.65c0,0.89,0.06,16.01,0.06,16.01  l-1.4,7.03c-0.49,2.04-3.13,5.43-5.05,6.49c-0.6,0.34-2.07,1.12-2.07,1.78c0,1.12,7.14,3.19,8.78,0.66c1.23-1.89,2.24-2.93,3.7-4.34  c2.24-2.15-0.26-4.39,0.06-7.29c0.52-5.08,2.7-9.5,3.42-14.32c0.43-2.9,0.34-5.45-0.95-8.76l0.95-9.18c1.06,1.58,2.04,4.11,3.04,6.2  c1.78,3.73,1.81,4.08,4.91,7.15c1.03,1.03,2.12,2.24,2.9,3.5c1.46,2.3,2.44,4.59,2.32,7.35c-1.06,1.92-1.52,1.81-2.9,2.98  c0.06,0.06-0.38,1.12,0.92,1.12c4.65,0,4.08-2.44,5.82-5.56c1.15-2.04,4.39-5.14,0.83-6.2c-1.12-0.34-2.18-1.01-2.84-2.1  c-2.47-4.13-2.58-4.04-3.87-7.86c-0.78-2.32-2.38-4.19-4.25-5.68c-1.15-2.61-1.61-4.45-1.98-7.23c-0.49-3.76-0.83-6.43-1.49-10.27  c1.81-7.2,2.76-8.73-0.34-15.64c-0.72-1.58-1.12-3.27-1.12-5.17c0-2.3,1.26-7.46,2.49-10.16c0.43-1.09,1.03-2.12,1.87-2.44  c0.75,2.79,3.33,8.53,4.82,9.93c0.08,1.12,0.06,2.27,0.49,3.33c1.89,4.53,4.59,8.64,5.94,13.43c0.46,1.64-0.15,2.44-0.63,3.76  c-0.15,0.63-0.17,2.47,0.11,3.85l0.66,0.34c-0.11,0.4-0.4,1.58-0.63,2.09c0.09,0.66,0.89,1.01,0.89,1.01  c1.03-0.23,2.53-3.99,2.47-5.48c-0.17-4.59-1.12-6.66-1.41-8.01c-1.52-7.78-0.66-9.93-4.99-17.48l-2.47-6.14  c-0.31-3.13-1.55-10.3-5.57-11.59c-0.69-0.2-1.35-0.26-2.38-0.57c-5.25-1.69-5.25-5.74-3.82-10.16c1.29-3.93,1.44-8.55-4.33-9.04  c-0.17-0.03-0.34-0.03-0.52-0.03C101.04,2.19,100.03,4.89,99.29,7.96"
    />
  </svg>
);
export const logoDark = ({ id }: { id: string }) => (
  <svg
    x="0px"
    y="0px"
    viewBox="0.14287 0.28555 206.69426 249.5716"
    fill="#F5F7FA"
  >
    <path
      fill="#7076B8"
      d="M122.39,236.24c-0.89,5.6-3.76,8.52-7.23,8.52c-2.21,0-3.47-1.55-3.1-3.93l1.21-7.58  c0.46-2.81,2.15-5.02,5.17-5.02C121.79,228.23,123.31,230.5,122.39,236.24 M110.54,247.38c0.46,0,1.58,1.95,5.25,1.95  c7.78,0,12.23-5.62,13.43-12.89c1.55-8.95-2.81-13.03-8.29-13.03c-2.58,0-4.51,0.23-5.91,0.98l2.1-12.31h-6.46l-6.43,36.79h4.88  c0,0,0.69-1.52,1.46-1.52h-0.03V247.38z M179.24,231.71c0.98-5.57-1.09-8.29-7.12-8.29c-4.51,0-6.26,1.98-7.95,3.67l0.17-3.1  l-5.97,0.03l-0.46,4.59l-3.47,20.32h6.54l2.1-13.17c0.75-4.53,3.87-8.01,6.83-8.01c3.27,0,3.24,1.87,2.73,4.74l-2.84,16.47h6.49  L179.24,231.71z M206.57,223.47h-7.63l-8.78,9.3l-0.11-0.03l3.5-20.61h-6.37l-6.43,36.76h6.46l0.66-3.67l1.32-8.06  c3.42,0,5.34,0.37,6.83,7.18l1.03,4.56h6.6c0,0-1.64-6.95-2.73-9.67c-1.12-2.87-2.35-4.74-4.97-5.25L206.57,223.47z M18.9,232.48  c4.74-1.03,7.18-4.85,7.84-7.35c1.69-6.83-1.35-12.17-10.07-12.08H6.67l-6.26,35.87h6.51l2.58-14.41c6-0.17,6.74,1.29,7.86,8.29  l1.03,6.11h6.74c-0.8-3.7-1.32-7.2-1.98-10.02c-0.69-2.96-1.81-5.25-4.62-6.34L18.9,232.48z M20.22,223.93  c-0.57,3.19-3.04,5.42-6.08,5.42h-3.85l1.98-11.34l3.5-0.03C19.9,218.02,20.7,220.74,20.22,223.93 M49.63,230.73  c0.95-5.42-1.98-7.32-7.84-7.32c-7.32,0-10.5,3.47-10.5,3.47l2.24,3.79c0,0,2.35-2.76,7.09-2.76c2.64,0,2.7,1.32,2.44,2.76  l-0.52,3.24c-9.41-0.23-14.24,1.78-15.33,7.95c-0.89,5.05,2.9,7.49,7.18,7.49c2.21,0,3.99-0.32,6.14-2.21  c0.43,1.21,1.18,1.87,2.01,2.01c1.35,0.29,3.7-0.03,4.39-0.55c-0.06-0.75,0-2.67,0.8-7.18L49.63,230.73z M41.91,237.33  c-1.03,7.4-2.04,8.15-5.6,8.15c-2.44,0-3.33-1.66-2.93-3.85C33.96,238.62,36.2,237.33,41.91,237.33 M152.9,230.73  c0.95-5.42-1.98-7.32-7.84-7.32c-7.32,0-10.48,3.47-10.48,3.47l2.24,3.79c0,0,2.35-2.76,7.09-2.76c2.64,0,2.7,1.32,2.44,2.76  l-0.52,3.24c-9.41-0.23-14.24,1.78-15.33,7.95c-0.89,5.05,2.9,7.49,7.18,7.49c2.21,0,3.99-0.32,6.14-2.21  c0.43,1.21,1.18,1.87,2.01,2.01c1.35,0.29,3.7-0.03,4.39-0.55c-0.06-0.75,0-2.67,0.8-7.18L152.9,230.73z M145.18,237.33  c-1.03,7.4-2.04,8.15-5.6,8.15c-2.44,0-3.33-1.66-2.93-3.85C137.23,238.62,139.47,237.33,145.18,237.33 M62.69,249.36  c7.78,0,12.23-5.63,13.43-12.89c1.55-8.95-2.81-13.03-8.29-13.03c-2.58,0-4.42,0.23-5.88,0.98l2.1-12.31h-6.49l-6.43,36.79h4.88  c0,0,0.69-1.52,1.41-1.52C57.93,247.38,59.05,249.36,62.69,249.36 M65.42,228.23c3.33,0,4.74,2.24,3.96,8.01  c-0.8,5.88-3.76,8.52-7.29,8.52c-2.21,0-3.47-1.55-3.04-3.93l1.23-7.58c0.46-2.81,2.15-5.02,5.11-5.02H65.42z M78.88,238.48  c1-9.36,5.22-15.15,15.27-15.15c7.46,0,9.9,5.68,8.93,11.8c-1.61,9.79-5.4,14.38-14.95,14.38C81.89,249.5,78.22,244.45,78.88,238.48   M96.24,235.58c0.49-2.58,0.98-7.61-3.47-7.61c-2.98,0-5.8,2.04-7.06,9.16c-0.77,4.33,0.06,7.84,3.53,7.84  C91.82,244.94,94.89,242.84,96.24,235.58"
    />
    <linearGradient
      id={`${id}-SVGID_1_`}
      gradientUnits="userSpaceOnUse"
      x1="-558.2126"
      y1="254.0371"
      x2="-555.7452"
      y2="254.0371"
      gradientTransform="matrix(73.2704 0 0 -73.2704 40935.2188 18762.3984)"
    >
      <stop offset="0" stopColor="#CB582A" />
      <stop offset="2.170000e-03" stopColor="#CB582A" />
      <stop offset="6.060000e-03" stopColor="#CB582A" />
      <stop offset="9.950000e-03" stopColor="#CA592B" />
      <stop offset="0.0138" stopColor="#CA592B" />
      <stop offset="0.0177" stopColor="#CA592C" />
      <stop offset="0.0216" stopColor="#CA5A2D" />
      <stop offset="0.0255" stopColor="#CA5A2D" />
      <stop offset="0.0294" stopColor="#C95A2D" />
      <stop offset="0.0333" stopColor="#C95A2E" />
      <stop offset="0.0372" stopColor="#C95A2E" />
      <stop offset="0.0411" stopColor="#C85B2F" />
      <stop offset="0.045" stopColor="#C85A30" />
      <stop offset="0.0489" stopColor="#C85A30" />
      <stop offset="0.0527" stopColor="#C85B31" />
      <stop offset="0.0566" stopColor="#C85B31" />
      <stop offset="0.0605" stopColor="#C85B31" />
      <stop offset="0.0644" stopColor="#C75B31" />
      <stop offset="0.0683" stopColor="#C75B31" />
      <stop offset="0.0722" stopColor="#C75B32" />
      <stop offset="0.0761" stopColor="#C75C34" />
      <stop offset="0.08" stopColor="#C75C34" />
      <stop offset="0.0838" stopColor="#C65C34" />
      <stop offset="0.0877" stopColor="#C65C34" />
      <stop offset="0.0916" stopColor="#C65C34" />
      <stop offset="0.0955" stopColor="#C55D36" />
      <stop offset="0.0994" stopColor="#C55D37" />
      <stop offset="0.1033" stopColor="#C55D37" />
      <stop offset="0.1072" stopColor="#C45D37" />
      <stop offset="0.1111" stopColor="#C45D37" />
      <stop offset="0.115" stopColor="#C45D37" />
      <stop offset="0.1189" stopColor="#C45E38" />
      <stop offset="0.1227" stopColor="#C45E38" />
      <stop offset="0.1266" stopColor="#C45E38" />
      <stop offset="0.1305" stopColor="#C35E39" />
      <stop offset="0.1344" stopColor="#C35E39" />
      <stop offset="0.1383" stopColor="#C35F3A" />
      <stop offset="0.1422" stopColor="#C35F3A" />
      <stop offset="0.1461" stopColor="#C35F3A" />
      <stop offset="0.15" stopColor="#C25F3B" />
      <stop offset="0.1539" stopColor="#C25F3B" />
      <stop offset="0.1577" stopColor="#C25F3C" />
      <stop offset="0.1616" stopColor="#C15F3C" />
      <stop offset="0.1655" stopColor="#C15F3C" />
      <stop offset="0.1694" stopColor="#C15F3C" />
      <stop offset="0.1733" stopColor="#C1603D" />
      <stop offset="0.1772" stopColor="#C1603D" />
      <stop offset="0.1811" stopColor="#C0613E" />
      <stop offset="0.185" stopColor="#C0603E" />
      <stop offset="0.1889" stopColor="#C0603E" />
      <stop offset="0.1928" stopColor="#C0613F" />
      <stop offset="0.1966" stopColor="#C0613F" />
      <stop offset="0.2005" stopColor="#C0613F" />
      <stop offset="0.2044" stopColor="#BF613F" />
      <stop offset="0.2083" stopColor="#BF6140" />
      <stop offset="0.2122" stopColor="#BF6141" />
      <stop offset="0.2161" stopColor="#BE6141" />
      <stop offset="0.22" stopColor="#BE6141" />
      <stop offset="0.2239" stopColor="#BE6141" />
      <stop offset="0.2278" stopColor="#BE6242" />
      <stop offset="0.2316" stopColor="#BE6242" />
      <stop offset="0.2355" stopColor="#BD6242" />
      <stop offset="0.2394" stopColor="#BD6243" />
      <stop offset="0.2433" stopColor="#BD6243" />
      <stop offset="0.2472" stopColor="#BD6244" />
      <stop offset="0.2511" stopColor="#BD6244" />
      <stop offset="0.255" stopColor="#BD6244" />
      <stop offset="0.2589" stopColor="#BC6244" />
      <stop offset="0.2628" stopColor="#BC6244" />
      <stop offset="0.2666" stopColor="#BC6346" />
      <stop offset="0.2705" stopColor="#BB6346" />
      <stop offset="0.2744" stopColor="#BB6346" />
      <stop offset="0.2783" stopColor="#BB6347" />
      <stop offset="0.2822" stopColor="#BB6347" />
      <stop offset="0.2861" stopColor="#BB6347" />
      <stop offset="0.29" stopColor="#BA6347" />
      <stop offset="0.2939" stopColor="#BB6448" />
      <stop offset="0.2978" stopColor="#BB6448" />
      <stop offset="0.3016" stopColor="#BA6448" />
      <stop offset="0.3055" stopColor="#BA6448" />
      <stop offset="0.3094" stopColor="#BA6448" />
      <stop offset="0.3133" stopColor="#B9644A" />
      <stop offset="0.3172" stopColor="#B9644A" />
      <stop offset="0.3211" stopColor="#B9644A" />
      <stop offset="0.325" stopColor="#B9654B" />
      <stop offset="0.3289" stopColor="#B9654B" />
      <stop offset="0.3328" stopColor="#B8654B" />
      <stop offset="0.3367" stopColor="#B8654B" />
      <stop offset="0.3405" stopColor="#B8654B" />
      <stop offset="0.3444" stopColor="#B8654D" />
      <stop offset="0.3483" stopColor="#B8654D" />
      <stop offset="0.3522" stopColor="#B8654D" />
      <stop offset="0.3561" stopColor="#B7664E" />
      <stop offset="0.36" stopColor="#B7664E" />
      <stop offset="0.3639" stopColor="#B7664E" />
      <stop offset="0.3678" stopColor="#B6664E" />
      <stop offset="0.3717" stopColor="#B6664E" />
      <stop offset="0.3755" stopColor="#B6664E" />
      <stop offset="0.3794" stopColor="#B6664F" />
      <stop offset="0.3833" stopColor="#B66650" />
      <stop offset="0.3872" stopColor="#B56650" />
      <stop offset="0.3911" stopColor="#B56650" />
      <stop offset="0.395" stopColor="#B56650" />
      <stop offset="0.3989" stopColor="#B56751" />
      <stop offset="0.4028" stopColor="#B56751" />
      <stop offset="0.4067" stopColor="#B56651" />
      <stop offset="0.4105" stopColor="#B46752" />
      <stop offset="0.4144" stopColor="#B46752" />
      <stop offset="0.4183" stopColor="#B46752" />
      <stop offset="0.4222" stopColor="#B46752" />
      <stop offset="0.4261" stopColor="#B46752" />
      <stop offset="0.43" stopColor="#B36853" />
      <stop offset="0.4339" stopColor="#B36753" />
      <stop offset="0.4378" stopColor="#B36753" />
      <stop offset="0.4417" stopColor="#B36754" />
      <stop offset="0.4455" stopColor="#B36754" />
      <stop offset="0.4494" stopColor="#B36754" />
      <stop offset="0.4533" stopColor="#B26855" />
      <stop offset="0.4572" stopColor="#B26855" />
      <stop offset="0.4611" stopColor="#B26755" />
      <stop offset="0.465" stopColor="#B26856" />
      <stop offset="0.4689" stopColor="#B26856" />
      <stop offset="0.4728" stopColor="#B26856" />
      <stop offset="0.4767" stopColor="#B16856" />
      <stop offset="0.4805" stopColor="#B16856" />
      <stop offset="0.4844" stopColor="#B16957" />
      <stop offset="0.4883" stopColor="#B16857" />
      <stop offset="0.4922" stopColor="#B16857" />
      <stop offset="0.4961" stopColor="#B06857" />
      <stop offset="0.5" stopColor="#B06857" />
      <stop offset="0.5039" stopColor="#B06858" />
      <stop offset="0.5078" stopColor="#B06959" />
      <stop offset="0.5117" stopColor="#B06959" />
      <stop offset="0.5156" stopColor="#B06859" />
      <stop offset="0.5195" stopColor="#AF695A" />
      <stop offset="0.5233" stopColor="#AF695A" />
      <stop offset="0.5272" stopColor="#AF695A" />
      <stop offset="0.5311" stopColor="#AF695A" />
      <stop offset="0.535" stopColor="#AF695A" />
      <stop offset="0.5389" stopColor="#AE695A" />
      <stop offset="0.5428" stopColor="#AE695B" />
      <stop offset="0.5467" stopColor="#AE695B" />
      <stop offset="0.5506" stopColor="#AE695B" />
      <stop offset="0.5544" stopColor="#AE695B" />
      <stop offset="0.5583" stopColor="#AE695B" />
      <stop offset="0.5622" stopColor="#AD6A5D" />
      <stop offset="0.5661" stopColor="#AD6A5D" />
      <stop offset="0.57" stopColor="#AD6A5D" />
      <stop offset="0.5739" stopColor="#AD6A5D" />
      <stop offset="0.5778" stopColor="#AD6A5D" />
      <stop offset="0.5817" stopColor="#AC6B5E" />
      <stop offset="0.5856" stopColor="#AC6B5E" />
      <stop offset="0.5895" stopColor="#AC6B5E" />
      <stop offset="0.5933" stopColor="#AC6B5E" />
      <stop offset="0.5972" stopColor="#AC6B5F" />
      <stop offset="0.6011" stopColor="#AC6B5F" />
      <stop offset="0.605" stopColor="#AB6B5F" />
      <stop offset="0.6089" stopColor="#AB6B5F" />
      <stop offset="0.6128" stopColor="#AB6B5F" />
      <stop offset="0.6167" stopColor="#AB6B5F" />
      <stop offset="0.6206" stopColor="#AB6B5F" />
      <stop offset="0.6245" stopColor="#AB6B60" />
      <stop offset="0.6284" stopColor="#AA6B60" />
      <stop offset="0.6322" stopColor="#AA6B60" />
      <stop offset="0.6361" stopColor="#AA6B60" />
      <stop offset="0.64" stopColor="#AA6B60" />
      <stop offset="0.6439" stopColor="#AA6B60" />
      <stop offset="0.6478" stopColor="#AA6C62" />
      <stop offset="0.6517" stopColor="#AA6C62" />
      <stop offset="0.6556" stopColor="#AA6B62" />
      <stop offset="0.6595" stopColor="#A96B62" />
      <stop offset="0.6633" stopColor="#A96B62" />
      <stop offset="0.6672" stopColor="#A96B62" />
      <stop offset="0.6711" stopColor="#A96C63" />
      <stop offset="0.675" stopColor="#A96C63" />
      <stop offset="0.6789" stopColor="#A86C63" />
      <stop offset="0.6828" stopColor="#A86C64" />
      <stop offset="0.6867" stopColor="#A86C64" />
      <stop offset="0.6906" stopColor="#A86C64" />
      <stop offset="0.6945" stopColor="#A86C64" />
      <stop offset="0.6984" stopColor="#A86C64" />
      <stop offset="0.7022" stopColor="#A76C64" />
      <stop offset="0.7061" stopColor="#A76C64" />
      <stop offset="0.71" stopColor="#A86D65" />
      <stop offset="0.7139" stopColor="#A76D65" />
      <stop offset="0.7178" stopColor="#A76D65" />
      <stop offset="0.7217" stopColor="#A76D65" />
      <stop offset="0.7256" stopColor="#A66D65" />
      <stop offset="0.7295" stopColor="#A66D65" />
      <stop offset="0.7334" stopColor="#A56D65" />
      <stop offset="0.7372" stopColor="#A66D67" />
      <stop offset="0.7411" stopColor="#A66D67" />
      <stop offset="0.745" stopColor="#A56D67" />
      <stop offset="0.7489" stopColor="#A56D67" />
      <stop offset="0.7528" stopColor="#A56D67" />
      <stop offset="0.7567" stopColor="#A46D67" />
      <stop offset="0.7606" stopColor="#A46D67" />
      <stop offset="0.7645" stopColor="#A56D68" />
      <stop offset="0.7684" stopColor="#A46D68" />
      <stop offset="0.7722" stopColor="#A46D68" />
      <stop offset="0.7761" stopColor="#A46D68" />
      <stop offset="0.78" stopColor="#A46D68" />
      <stop offset="0.7839" stopColor="#A46D68" />
      <stop offset="0.7878" stopColor="#A46E69" />
      <stop offset="0.7917" stopColor="#A46E69" />
      <stop offset="0.7956" stopColor="#A46E6A" />
      <stop offset="0.7995" stopColor="#A36E6A" />
      <stop offset="0.8034" stopColor="#A36E6A" />
      <stop offset="0.8073" stopColor="#A36E6A" />
      <stop offset="0.8111" stopColor="#A36F6B" />
      <stop offset="0.815" stopColor="#A36F6B" />
      <stop offset="0.8189" stopColor="#A36E6B" />
      <stop offset="0.8228" stopColor="#A26E6B" />
      <stop offset="0.8267" stopColor="#A26E6B" />
      <stop offset="0.8306" stopColor="#A26F6C" />
      <stop offset="0.8345" stopColor="#A26F6C" />
      <stop offset="0.8384" stopColor="#A26F6C" />
      <stop offset="0.8422" stopColor="#A16F6C" />
      <stop offset="0.8461" stopColor="#A16E6C" />
      <stop offset="0.85" stopColor="#A16E6C" />
      <stop offset="0.8539" stopColor="#A16F6E" />
      <stop offset="0.8578" stopColor="#A16F6E" />
      <stop offset="0.8617" stopColor="#A16F6E" />
      <stop offset="0.8656" stopColor="#A16F6E" />
      <stop offset="0.8695" stopColor="#A16F6E" />
      <stop offset="0.8734" stopColor="#A1706F" />
      <stop offset="0.8773" stopColor="#A1706F" />
      <stop offset="0.8812" stopColor="#A1706F" />
      <stop offset="0.885" stopColor="#A0706F" />
      <stop offset="0.8889" stopColor="#A0706F" />
      <stop offset="0.8928" stopColor="#A0706F" />
      <stop offset="0.8967" stopColor="#9F706F" />
      <stop offset="0.9006" stopColor="#9F706F" />
      <stop offset="0.9045" stopColor="#9F6F6F" />
      <stop offset="0.9084" stopColor="#9F7070" />
      <stop offset="0.9123" stopColor="#9F7071" />
      <stop offset="0.9161" stopColor="#9F7071" />
      <stop offset="0.92" stopColor="#9E7071" />
      <stop offset="0.9239" stopColor="#9E7071" />
      <stop offset="0.9278" stopColor="#9E7071" />
      <stop offset="0.9317" stopColor="#9E7072" />
      <stop offset="0.9356" stopColor="#9E7072" />
      <stop offset="0.9395" stopColor="#9E7072" />
      <stop offset="0.9434" stopColor="#9E7072" />
      <stop offset="0.9473" stopColor="#9E7072" />
      <stop offset="0.9512" stopColor="#9D7072" />
      <stop offset="0.955" stopColor="#9D7072" />
      <stop offset="0.9589" stopColor="#9D6F72" />
      <stop offset="0.9628" stopColor="#9D7173" />
      <stop offset="0.9667" stopColor="#9D7173" />
      <stop offset="0.9706" stopColor="#9D7173" />
      <stop offset="0.9745" stopColor="#9C7173" />
      <stop offset="0.9784" stopColor="#9C7173" />
      <stop offset="0.9823" stopColor="#9C7173" />
      <stop offset="0.9862" stopColor="#9C7174" />
      <stop offset="1" stopColor="#9C7174" />
    </linearGradient>
    <path
      fill={`url(#${id}-SVGID_1_)`}
      d="M37.55,126.98c-5.14,10.27-3.5,24.97,7.35,35.61c12.34,12.11,31.63,19.4,57.89,19.4  c26.35,0,45.63-7.52,57.43-19.4c11.59-11.65,12.02-26.81,7.29-35.96c-1.92-3.7-4.51-7.12-8.04-10.36c2.64,2.69,4.79,5.63,6.38,8.72  c0.06,0.11,0.11,0.26,0.17,0.37c0.23,0.46,0.46,0.95,0.66,1.43c0.98,2.27,1.63,4.59,1.95,6.95c0.72,5.22-0.23,10.36-2.9,15.41  c-1.64,3.07-3.9,6.11-6.86,9.01c-12.02,11.79-32.52,19.06-56.28,19.06c-22.33,0-41.73-6.4-53.99-16.93l0,0  c-0.8-0.69-1.58-1.41-2.3-2.12c-10.5-10.31-12.43-22.1-7.18-32.81c0.11-0.23,0.23-0.46,0.34-0.69c1.61-3.04,3.76-5.91,6.34-8.55  c0.03-0.03,0.08-0.08,0.11-0.12C42.61,119.28,39.96,122.15,37.55,126.98"
    />
    <path
      fill="#F36717"
      d="M139.89,103.64c-11.14-4.62-24.11-7-37.28-7c-13.17,0-26.15,2.38-37.28,7  c-12.2,5.05-21.64,12.57-26.15,21.73c-5.25,10.7-3.33,22.5,7.18,32.8c12.03,11.8,32.52,19.06,56.28,19.06  c23.76,0,44.26-7.26,56.28-19.06c10.5-10.3,12.43-22.1,7.15-32.8C161.5,116.21,152.09,108.7,139.89,103.64"
    />
    <linearGradient
      id={`${id}-SVGID_2_`}
      gradientUnits="userSpaceOnUse"
      x1="-555.066"
      y1="256.1931"
      x2="-552.5981"
      y2="256.1931"
      gradientTransform="matrix(45.2844 -7.9848 -7.9848 -45.2844 27205.0078 7306.6411)"
    >
      <stop offset="0" stopColor="#FDDB63" />
      <stop offset="3.460000e-03" stopColor="#FDDB63" />
      <stop offset="0.0112" stopColor="#FDDA62" />
      <stop offset="0.019" stopColor="#FDD962" />
      <stop offset="0.0267" stopColor="#FDD861" />
      <stop offset="0.0345" stopColor="#FDD761" />
      <stop offset="0.0422" stopColor="#FDD660" />
      <stop offset="0.05" stopColor="#FDD65F" />
      <stop offset="0.0578" stopColor="#FCD55F" />
      <stop offset="0.0655" stopColor="#FCD45E" />
      <stop offset="0.0733" stopColor="#FCD35E" />
      <stop offset="0.081" stopColor="#FCD25D" />
      <stop offset="0.0888" stopColor="#FCD15C" />
      <stop offset="0.0966" stopColor="#FCD05C" />
      <stop offset="0.1043" stopColor="#FCCF5B" />
      <stop offset="0.1121" stopColor="#FCCE5B" />
      <stop offset="0.1198" stopColor="#FCCD5A" />
      <stop offset="0.1276" stopColor="#FCCC5A" />
      <stop offset="0.1354" stopColor="#FCCC59" />
      <stop offset="0.1431" stopColor="#FCCB58" />
      <stop offset="0.1509" stopColor="#FCCA58" />
      <stop offset="0.1586" stopColor="#FBC957" />
      <stop offset="0.1664" stopColor="#FBC857" />
      <stop offset="0.1741" stopColor="#FBC756" />
      <stop offset="0.1819" stopColor="#FBC655" />
      <stop offset="0.1897" stopColor="#FBC555" />
      <stop offset="0.1974" stopColor="#FBC454" />
      <stop offset="0.2052" stopColor="#FBC354" />
      <stop offset="0.2129" stopColor="#FBC353" />
      <stop offset="0.2207" stopColor="#FBC252" />
      <stop offset="0.2285" stopColor="#FBC152" />
      <stop offset="0.2362" stopColor="#FBC051" />
      <stop offset="0.244" stopColor="#FBBF51" />
      <stop offset="0.2517" stopColor="#FBBE50" />
      <stop offset="0.2595" stopColor="#FABD4F" />
      <stop offset="0.2672" stopColor="#FABC4F" />
      <stop offset="0.275" stopColor="#FABB4E" />
      <stop offset="0.2828" stopColor="#FABA4E" />
      <stop offset="0.2905" stopColor="#FAB94D" />
      <stop offset="0.2983" stopColor="#FAB94C" />
      <stop offset="0.306" stopColor="#FAB84C" />
      <stop offset="0.3138" stopColor="#FAB74B" />
      <stop offset="0.3216" stopColor="#FAB64B" />
      <stop offset="0.3293" stopColor="#FAB54A" />
      <stop offset="0.3371" stopColor="#FAB449" />
      <stop offset="0.3448" stopColor="#FAB349" />
      <stop offset="0.3526" stopColor="#F9B248" />
      <stop offset="0.3604" stopColor="#F9B148" />
      <stop offset="0.3681" stopColor="#F9B047" />
      <stop offset="0.3759" stopColor="#F9AF47" />
      <stop offset="0.3836" stopColor="#F9AF46" />
      <stop offset="0.3914" stopColor="#F9AE45" />
      <stop offset="0.3991" stopColor="#F9AD45" />
      <stop offset="0.4069" stopColor="#F9AC44" />
      <stop offset="0.4147" stopColor="#F9AB44" />
      <stop offset="0.4224" stopColor="#F9AA43" />
      <stop offset="0.4302" stopColor="#F9A942" />
      <stop offset="0.4379" stopColor="#F9A842" />
      <stop offset="0.4457" stopColor="#F9A741" />
      <stop offset="0.4535" stopColor="#F8A641" />
      <stop offset="0.4612" stopColor="#F8A640" />
      <stop offset="0.469" stopColor="#F8A53F" />
      <stop offset="0.4767" stopColor="#F8A43F" />
      <stop offset="0.4845" stopColor="#F8A33E" />
      <stop offset="0.4922" stopColor="#F8A23E" />
      <stop offset="0.5" stopColor="#F8A13D" />
      <stop offset="0.5078" stopColor="#F8A03C" />
      <stop offset="0.5155" stopColor="#F89F3C" />
      <stop offset="0.5233" stopColor="#F89E3B" />
      <stop offset="0.531" stopColor="#F89D3B" />
      <stop offset="0.5388" stopColor="#F89C3A" />
      <stop offset="0.5465" stopColor="#F89C39" />
      <stop offset="0.5543" stopColor="#F79B39" />
      <stop offset="0.5621" stopColor="#F79A38" />
      <stop offset="0.5698" stopColor="#F79938" />
      <stop offset="0.5776" stopColor="#F79837" />
      <stop offset="0.5853" stopColor="#F79736" />
      <stop offset="0.5931" stopColor="#F79636" />
      <stop offset="0.6009" stopColor="#F79535" />
      <stop offset="0.6086" stopColor="#F79435" />
      <stop offset="0.6164" stopColor="#F79334" />
      <stop offset="0.6241" stopColor="#F79234" />
      <stop offset="0.6319" stopColor="#F79233" />
      <stop offset="0.6396" stopColor="#F79132" />
      <stop offset="0.6474" stopColor="#F79032" />
      <stop offset="0.6552" stopColor="#F68F31" />
      <stop offset="0.6629" stopColor="#F68E31" />
      <stop offset="0.6707" stopColor="#F68D30" />
      <stop offset="0.6784" stopColor="#F68C2F" />
      <stop offset="0.6862" stopColor="#F68B2F" />
      <stop offset="0.694" stopColor="#F68A2E" />
      <stop offset="0.7017" stopColor="#F6892E" />
      <stop offset="0.7095" stopColor="#F6892D" />
      <stop offset="0.7172" stopColor="#F6882C" />
      <stop offset="0.725" stopColor="#F6872C" />
      <stop offset="0.7328" stopColor="#F6862B" />
      <stop offset="0.7405" stopColor="#F6852B" />
      <stop offset="0.7483" stopColor="#F5842A" />
      <stop offset="0.756" stopColor="#F58329" />
      <stop offset="0.7638" stopColor="#F58229" />
      <stop offset="0.7715" stopColor="#F58128" />
      <stop offset="0.7793" stopColor="#F58028" />
      <stop offset="0.7871" stopColor="#F57F27" />
      <stop offset="0.7948" stopColor="#F57F26" />
      <stop offset="0.8026" stopColor="#F57E26" />
      <stop offset="0.8103" stopColor="#F57D25" />
      <stop offset="0.8181" stopColor="#F57C25" />
      <stop offset="0.8259" stopColor="#F57B24" />
      <stop offset="0.8336" stopColor="#F57A23" />
      <stop offset="0.8414" stopColor="#F57923" />
      <stop offset="0.8491" stopColor="#F47822" />
      <stop offset="0.8569" stopColor="#F47722" />
      <stop offset="0.8647" stopColor="#F47621" />
      <stop offset="0.8724" stopColor="#F47521" />
      <stop offset="0.8802" stopColor="#F47520" />
      <stop offset="0.8879" stopColor="#F4741F" />
      <stop offset="0.8957" stopColor="#F4731F" />
      <stop offset="0.9034" stopColor="#F4721E" />
      <stop offset="0.9112" stopColor="#F4711E" />
      <stop offset="0.919" stopColor="#F4701D" />
      <stop offset="0.9267" stopColor="#F46F1C" />
      <stop offset="0.9345" stopColor="#F46E1C" />
      <stop offset="0.9422" stopColor="#F46D1B" />
      <stop offset="0.95" stopColor="#F36C1B" />
      <stop offset="0.9578" stopColor="#F36C1A" />
      <stop offset="0.9655" stopColor="#F36B19" />
      <stop offset="0.9733" stopColor="#F36A19" />
      <stop offset="0.981" stopColor="#F36918" />
      <stop offset="0.9888" stopColor="#F36818" />
      <stop offset="0.9965" stopColor="#F36717" />
      <stop offset="1" stopColor="#F36717" />
    </linearGradient>
    <path
      fill={`url(#${id}-SVGID_2_)`}
      d="M104.91,126.69c0,0-1.06,0.29-2.24,0.6c0.08,2.76,0.17,5.57,0.26,8.38c1.86-2.9,3.18-5.91,3.96-9.01  c-0.26-0.03-0.55-0.03-0.8-0.03C105.69,126.63,105.28,126.66,104.91,126.69 M102.59,124.91c0,0.34,0.03,0.69,0.03,1.03  c0.32-0.46,0.63-0.86,0.95-1.24c-0.11-0.06-0.23-0.11-0.34-0.17C103.02,124.68,102.82,124.79,102.59,124.91 M102.59,124.19  c-12.46,0.2-22.3,0.78-34.55,1.81c10.76,0.03,19.11,0.43,30.05,1.29c-7.78,4.79-15.38,9.9-22.79,15.24  c7.69-4.34,15.53-8.44,23.48-12.26c-0.2-0.89-0.4-1.78-0.6-2.67l-0.06-0.32c1.49-0.92,3.01-1.84,4.5-2.76  C102.59,124.42,102.59,124.31,102.59,124.19C102.59,124.16,102.59,124.16,102.59,124.19C102.59,124.16,102.59,124.16,102.59,124.19   M102.59,124.19c0.11,0.06,0.2,0.11,0.31,0.18c-0.11,0.06-0.23,0.14-0.31,0.2c0.06-0.03,0.08-0.06,0.14-0.09l0.2-0.11  c0.11-0.06,0.23-0.15,0.34-0.2C103.02,124.16,102.82,124.16,102.59,124.19 M103.25,124.16L103.25,124.16 M103.25,124.16  c0.29,0,0.55,0,0.83,0c0.34-0.37,0.69-0.75,1.09-1.12C104.51,123.42,103.88,123.79,103.25,124.16 M107.53,118.68  c0,0.03,0.03,0.08,0.03,0.11C107.55,118.77,107.55,118.71,107.53,118.68L107.53,118.68 M93.49,121.78c1.55-0.17,3.13-0.34,4.68-0.49  c-6.28-3.5-12.71-6.77-19.29-9.67C83.91,114.78,88.75,118.19,93.49,121.78 M98.17,121.29c1.66,0.92,3.33,1.86,4.99,2.84  c0.03,0.03,0.06,0.03,0.08,0.06c0-6.14,0-12.28,0-18.46C101.38,110.85,99.72,116.07,98.17,121.29 M103.16,102.61L103.16,102.61  c-16.88,0-43.88,5.77-48.13,25.23c-0.72,3.27-0.66,6.26,0,8.98c2.41,8.61,10.99,14.52,20.78,18.25  c10.31-3.64,18.34-8.92,23.76-15.04c-0.54-2.44-1.09-4.88-1.66-7.35c-9.99,4.71-19.06,9.21-28.96,14.46  c7-6.95,13.63-12.94,21.15-19.31c-10.68-0.69-20.89-0.83-31.8-0.98c10.7-2.33,21.3-4.13,32.17-5.51  c-5.11-4.02-10.11-7.75-15.59-11.25l0,0l-0.83-0.52c8.24,2.09,16.05,4.59,24.02,7.52c1.58-4.71,3.24-9.39,5.14-13.98  C103.19,102.95,103.19,102.78,103.16,102.61z M65.31,103.64c-11.88,4.94-21.15,12.17-25.8,21.04c-0.11,0.23-0.23,0.46-0.34,0.69  c-5.28,10.7-3.33,22.5,7.18,32.8c0.75,0.72,1.49,1.44,2.3,2.12c8.9-0.52,16.96-1.98,24.02-4.16c-9.44-4.02-17.42-10.1-19.49-18.74  c-0.83-3.01-0.95-6.37-0.11-10.05c4.5-20.12,32.43-26.12,49.94-26.12c0.03,0,0.08,0,0.11,0c0-1.61,0.17-3.16,0.37-4.59  c-0.31,0-0.6,0-0.92,0C89.42,96.64,76.44,99.02,65.31,103.64"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#FFFFFF"
      d="M74.07,109.56c8.24,2.09,16.04,4.59,24.02,7.52  c1.58-4.74,3.24-9.44,5.17-14.03c1.92,4.62,3.59,9.3,5.17,14.03c7.95-2.93,15.64-5.34,23.88-7.4c-5.8,3.64-10.91,7.38-16.27,11.59  c10.88,1.38,21.07,3.19,31.77,5.51c-10.68-0.23-20.75,0.14-31.4,0.83c7.52,6.37,13.95,12.54,20.95,19.49  c-9.59-5.48-18.57-10.07-28.56-14.78c-1.92,8.35-3.76,16.73-5.54,25.11c-1.75-8.38-3.39-16.36-5.31-24.71  c-9.99,4.71-19.06,9.21-28.96,14.46c7-6.95,13.63-12.94,21.15-19.31c-10.68-0.69-20.89-0.83-31.8-0.98  c10.71-2.32,21.3-4.13,32.17-5.51C85.12,117.11,79.84,113.21,74.07,109.56 M103.26,124.17c0-6.14,0-12.28,0-18.45  c-1.87,5.14-3.53,10.33-5.08,15.56C99.88,122.22,101.57,123.2,103.26,124.17 M78.87,111.6c6.6,2.9,13,6.17,19.29,9.67  c-1.55,0.14-3.13,0.32-4.68,0.49C88.74,118.2,83.89,114.79,78.87,111.6 M103.26,124.17c12.71,0.03,25.4,0.66,38.03,1.92  c-11.11-2.01-21.87-3.53-32.98-4.82C106.59,122.22,104.93,123.17,103.26,124.17 M127.6,111.6c-6.6,2.9-13.03,6.17-19.31,9.67  c-0.26-0.86-0.52-1.72-0.77-2.58C114.11,116.05,120.83,113.67,127.6,111.6 M102.57,124.17c0.26,8.9,0.6,18.37,0.66,26.98  c1.66-7.98,3.39-15.93,5.22-23.88C106.73,126.21,104.32,125.18,102.57,124.17 M131.24,142.54c-7.4-5.34-14.98-10.45-22.76-15.27  c1.58-0.11,3.19-0.26,4.76-0.34C119.42,131.92,125.42,137.14,131.24,142.54 M103.26,124.17c-12.77,0.17-22.76,0.75-35.21,1.84  c10.76,0.03,19.11,0.43,30.05,1.29C99.79,126.24,101.51,125.2,103.26,124.17 M75.28,142.54c7.43-5.34,15.01-10.45,22.79-15.24  c0.23,1,0.46,1.98,0.69,2.98C90.78,134.1,82.97,138.21,75.28,142.54 M104.5,174.81c0-3.47,0-6.92-0.03-10.36  c-0.37-0.26-0.86-0.52-1.23-0.78c-0.37,0.26-0.92,0.52-1.29,0.78c0,3.44,0,6.92,0,10.36c0.4,0.26,0.92,0.55,1.29,0.83  C103.61,175.38,104.13,175.09,104.5,174.81 M42.99,149.74c-0.2,0.37-0.4,0.77-0.6,1.18c0.37,0.14,1.12,0.37,1.44,0.52  c3.62-1.92,7.2-3.87,10.76-5.74c0.14-0.55,0.23-0.86,0.37-1.26c-0.37-0.09-0.75-0.2-1.09-0.29  C50.22,145.96,46.6,147.82,42.99,149.74 M40.32,128.47c-0.34,0.26-0.66,0.52-1,0.8l0.55,0.75c3.39-0.49,6.77-0.89,10.16-1.23  c0.32-0.32,0.69-0.66,1-0.95l-0.6-0.6C47.06,127.58,43.7,127.98,40.32,128.47 M53.33,111.32c-0.34,0.14-0.69,0.29-1.03,0.43  l0.09,0.77c2.5,0.34,4.99,0.77,7.46,1.26c0.32-0.2,0.75-0.46,1.06-0.6l-0.14-0.66C58.3,112.07,55.8,111.67,53.33,111.32   M129.53,100.74c-1.32,0.83-2.61,1.69-3.9,2.53l0.37,0.43c0.34,0,0.66,0,1,0c1.26-0.89,2.53-1.75,3.85-2.58l-0.37-0.37  C130.16,100.74,129.84,100.74,129.53,100.74 M102.35,97.14c0,1.03,0,2.04-0.03,3.04l0.75,0.26l0.75-0.26c0-1-0.03-2.04-0.03-3.04  l-0.72-0.23L102.35,97.14 M75.07,101.2c1.32,0.83,2.58,1.69,3.85,2.61c0.32,0,0.8-0.09,1.12-0.09l0.37-0.43  c-1.26-0.89-2.55-1.72-3.87-2.55c-0.32,0-0.63,0-0.95,0L75.07,101.2 M67.12,168.48c2.53-3.04,5.11-6.06,7.66-9.04  c-0.14-0.29-0.37-0.8-0.49-1.12c-0.52,0.09-1.15,0.2-1.66,0.32c-2.61,2.98-5.17,6-7.69,9.01c0.11,0.37,0.37,0.72,0.49,1.09  C65.94,168.59,66.6,168.59,67.12,168.48 M162.65,149.74c-3.59-1.92-7.23-3.79-10.88-5.6c-0.34,0.09-0.72,0.2-1.09,0.29  c0.14,0.4,0.23,0.72,0.37,1.26c3.56,1.87,7.15,3.82,10.76,5.74c0.32-0.14,1.06-0.37,1.44-0.52  C163.05,150.52,162.85,150.12,162.65,149.74 M165.32,128.47c-3.36-0.49-6.74-0.89-10.1-1.23l-0.6,0.6c0.32,0.29,0.69,0.63,1,0.95  c3.39,0.34,6.77,0.75,10.16,1.23l0.55-0.75C165.98,128.98,165.66,128.72,165.32,128.47 M152.34,111.32  c-2.5,0.34-4.99,0.75-7.49,1.21l-0.11,0.66c0.32,0.14,0.75,0.4,1.06,0.6c2.47-0.49,4.97-0.92,7.46-1.26l0.11-0.77  C153.02,111.61,152.68,111.47,152.34,111.32 M138.52,168.48c0.43,0.06,1.18,0.17,1.69,0.26c0.17-0.34,0.32-0.72,0.49-1.09  c-2.53-3.01-5.08-6.03-7.69-9.01c-0.52-0.11-1.15-0.23-1.66-0.32c-0.11,0.32-0.34,0.83-0.49,1.12  C133.44,162.42,135.99,165.44,138.52,168.48"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#D24F54"
      d="M102.99,124.32l0.26-0.17v0.37c-1.72,1.03-3.42,2.04-5.11,3.07  l-0.06-0.32c1.55-0.95,3.1-1.89,4.65-2.81L102.99,124.32 M108.3,121.27c-0.26-0.86-0.52-1.72-0.77-2.58V119  c0.23,0.78,0.46,1.55,0.69,2.32L108.3,121.27"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#D34D53"
      d="M103.25,103.36c1.92,4.62,3.59,9.3,5.17,14.03  c7.69-2.84,15.1-5.14,23.05-7.2l0.83-0.52c-8.24,2.1-15.9,4.48-23.88,7.4c-1.58-4.74-3.24-9.41-5.17-14.03  c-1.92,4.62-3.59,9.3-5.17,14.03c-7.95-2.93-15.78-5.42-24.02-7.52l0.83,0.52c7.95,2.07,15.5,4.48,23.19,7.32  C99.66,112.65,101.32,107.98,103.25,103.36"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#CB582A"
      d="M42.95,150.34l-0.34,0.63l-0.23-0.09c0.2-0.4,0.4-0.77,0.6-1.18  c3.62-1.92,7.23-3.79,10.88-5.6c0.37,0.09,0.72,0.2,1.09,0.29l-0.2,0.63c-0.29-0.09-0.69-0.14-0.98-0.23  C50.13,146.61,46.57,148.42,42.95,150.34 M40.45,128.94c3.36-0.49,6.66-0.89,10.07-1.26l0.34,0.34l0.2-0.2l-0.6-0.6  c-3.39,0.34-6.74,0.78-10.13,1.26c-0.32,0.29-0.66,0.55-0.98,0.8l0.23,0.32L40.45,128.94 M53.38,111.92  c2.47,0.34,7.52,1.35,7.58,1.32l-0.14-0.66c-2.5-0.49-4.97-0.89-7.46-1.23c-0.34,0.14-0.69,0.29-1.03,0.43l0.06,0.52L53.38,111.92z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#C05D61"
      d="M108.45,127.27c7.81,4.79,15.38,9.93,22.76,15.27V143  c-9.76-7.03-17.48-12.08-22.79-15.35c-1.84,7.95-3.53,15.84-5.19,23.82v-0.32C104.87,143.26,106.65,135.1,108.45,127.27   M116.72,127.9l-0.34-0.29v0.49c7.26,6.14,13.06,11.65,19.8,18.34l1.15,0.66C130.23,140.04,123.89,133.98,116.72,127.9   M115.99,121.28v0.37c10.33,1.32,19.8,2.96,29.99,5.11c0.52,0,1.26,0.03,1.78,0.03C137.06,124.47,126.87,122.66,115.99,121.28   M103.25,124.15h0.52H103.25l0.26,0.17l0.32,0.17c12.54,0.03,25,0.66,37.45,1.92v-0.34C128.65,124.81,115.96,124.18,103.25,124.15   M108.3,121.27l0.46,0.06c6.14-3.39,12.43-6.57,18.86-9.41v-0.32C121.01,114.5,114.58,117.77,108.3,121.27 M130.48,101.28l0.06,0.06  l0.32-0.2l-0.37-0.37c-0.32,0-0.63,0-0.95,0c-1.32,0.83-2.61,1.66-3.87,2.55l0.29,0.32c1.18-0.8,2.38-1.61,3.59-2.35  C129.85,101.28,130.16,101.28,130.48,101.28 M74.24,158.75l0.46,0.86l0.14-0.14c-0.06-0.14-0.34-0.83-0.49-1.12  c-0.52,0.11-1.15,0.23-1.66,0.32c-2.58,2.98-5.17,5.97-7.69,9.01l0.2,0.43c1.64-1.92,5.14-6.14,7.69-9.07  C73.26,158.89,73.81,158.84,74.24,158.75 M162.71,150.34l0.34,0.63l0.23-0.09c-0.2-0.4-0.4-0.77-0.6-1.18  c-3.62-1.92-7.23-3.79-10.88-5.6c-0.37,0.09-0.75,0.2-1.09,0.29l0.2,0.63l0.98-0.23C155.51,146.61,159.09,148.42,162.71,150.34   M165.22,128.94l0.86,0.66l0.23-0.32c-0.32-0.26-0.66-0.52-0.98-0.8c-3.39-0.49-6.74-0.92-10.13-1.26l-0.6,0.6l0.2,0.2l0.34-0.34  C158.53,128.05,161.83,128.45,165.22,128.94 M153.29,112.29l0.06-0.52c-0.34-0.14-0.69-0.29-1.03-0.43  c-2.5,0.34-4.99,0.75-7.46,1.23l-0.14,0.66c0.06,0.03,5.11-0.98,7.58-1.32L153.29,112.29z M131.43,158.75  c0.4,0.09,0.98,0.14,1.35,0.32c2.55,2.93,6.08,7.12,7.72,9.04l0.17-0.43c-2.53-3.04-5.11-6.03-7.69-9.01  c-0.52-0.09-1.15-0.2-1.66-0.32c-0.14,0.29-0.43,0.98-0.49,1.12l0.14,0.14L131.43,158.75 M104.26,164.82l0.23,9.99l-0.03-10.36  c-0.37-0.26-0.86-0.52-1.23-0.77c-0.37,0.26-0.92,0.52-1.29,0.77v10.36l0.23-9.99c0.32-0.2,0.75-0.4,1.03-0.6L104.26,164.82z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#CF543E"
      d="M90.09,128.3c-7.29,6.14-13.26,11.54-20.03,18.22l-1.09,0.63  c6.89-6.83,13.72-13.03,21.12-19.31V128.3z M98.17,121.29l-0.49,0.06c-1.41,0.14-2.81,0.29-4.22,0.46c-4.74-3.59-9.59-7-14.61-10.19  v0.37c5.02,3.19,9.87,6.6,14.61,10.19c1.55-0.17,3.13-0.34,4.68-0.49c1.52,0.83,2.96,1.64,4.48,2.53h0.6  C101.58,123.21,99.83,122.21,98.17,121.29 M75.28,142.98c7.69-4.33,15.53-8.44,23.48-12.25v-0.43c-7.98,3.82-15.79,7.92-23.48,12.25  V142.98z M90.13,121.38c-10.76,1.38-21.24,3.19-31.83,5.45c0.52,0,1.15,0.03,1.69,0.03c10.19-2.15,20.15-3.85,30.48-5.17v-0.37  L90.13,121.38z M98.08,127.29c-10.02-0.86-19.98-1.35-30.02-1.29v0.32c9.9-0.09,19.75,0.4,29.62,1.26L98.08,127.29 M76.57,101.18  c1.21,0.75,2.38,1.61,3.56,2.41l0.29-0.32c-1.26-0.89-2.55-1.75-3.87-2.55c-0.32,0-0.63,0-0.95,0l-0.52,0.46l0.32,0.2l0.23-0.2  C75.94,101.18,76.25,101.18,76.57,101.18 M53.05,127.37c-5.6,25.05,31.83,34.41,49.97,34.41s55.56-9.36,49.94-34.41  c-4.53-20.12-32.46-26.12-49.97-26.12C85.48,101.25,57.55,107.22,53.05,127.37 M54.88,127.23c-5.25,24.08,30.68,32.98,48.13,32.98  c17.45,0,53.38-8.9,48.13-32.98C146.9,107.77,119.89,102,103.01,102C86.14,102,59.13,107.77,54.88,127.23"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="#FFFFFF"
      d="M53.22,128c4.51-20.15,31.28-26.23,49.94-26.23  c18.63,0,45.43,6.08,49.94,26.23c5.63,25.05-31.8,34.38-49.94,34.38C85.02,162.38,47.59,153.05,53.22,128 M55.05,127.85  c4.25-19.46,31.25-25.23,48.13-25.23c16.85,0,43.88,5.77,48.13,25.23c5.25,24.08-30.68,32.98-48.13,32.98S49.8,151.9,55.05,127.85"
    />
    <linearGradient
      id={`${id}-SVGID_3_`}
      gradientUnits="userSpaceOnUse"
      x1="-555.066"
      y1="256.1569"
      x2="-552.5981"
      y2="256.1569"
      gradientTransform="matrix(45.2844 -7.9848 -7.9848 -45.2844 27205.0078 7306.6411)"
    >
      <stop offset="0" stopColor="#9C735F" />
      <stop offset="3.460000e-03" stopColor="#9C735F" />
      <stop offset="0.0112" stopColor="#9C735F" />
      <stop offset="0.019" stopColor="#9C725F" />
      <stop offset="0.0267" stopColor="#9C725F" />
      <stop offset="0.0345" stopColor="#9D7260" />
      <stop offset="0.0422" stopColor="#9D7260" />
      <stop offset="0.05" stopColor="#9D725F" />
      <stop offset="0.0578" stopColor="#9D7260" />
      <stop offset="0.0655" stopColor="#9D7260" />
      <stop offset="0.0733" stopColor="#9D7260" />
      <stop offset="0.081" stopColor="#9E7260" />
      <stop offset="0.0888" stopColor="#9E7260" />
      <stop offset="0.0966" stopColor="#9E7160" />
      <stop offset="0.1043" stopColor="#9E7160" />
      <stop offset="0.1121" stopColor="#9E715F" />
      <stop offset="0.1198" stopColor="#9F7160" />
      <stop offset="0.1276" stopColor="#9F7160" />
      <stop offset="0.1354" stopColor="#9F715F" />
      <stop offset="0.1431" stopColor="#9F7160" />
      <stop offset="0.1509" stopColor="#9F7160" />
      <stop offset="0.1586" stopColor="#9F7060" />
      <stop offset="0.1664" stopColor="#A07160" />
      <stop offset="0.1741" stopColor="#A0705F" />
      <stop offset="0.1819" stopColor="#A17060" />
      <stop offset="0.1897" stopColor="#A17060" />
      <stop offset="0.1974" stopColor="#A1705F" />
      <stop offset="0.2052" stopColor="#A17060" />
      <stop offset="0.2129" stopColor="#A17060" />
      <stop offset="0.2207" stopColor="#A27061" />
      <stop offset="0.2285" stopColor="#A27060" />
      <stop offset="0.2362" stopColor="#A27060" />
      <stop offset="0.244" stopColor="#A26F61" />
      <stop offset="0.2517" stopColor="#A26F60" />
      <stop offset="0.2595" stopColor="#A26F60" />
      <stop offset="0.2672" stopColor="#A36F61" />
      <stop offset="0.275" stopColor="#A36F61" />
      <stop offset="0.2828" stopColor="#A36F61" />
      <stop offset="0.2905" stopColor="#A36F61" />
      <stop offset="0.2983" stopColor="#A36F61" />
      <stop offset="0.306" stopColor="#A36E61" />
      <stop offset="0.3138" stopColor="#A36E60" />
      <stop offset="0.3216" stopColor="#A36E60" />
      <stop offset="0.3293" stopColor="#A46E61" />
      <stop offset="0.3371" stopColor="#A46E61" />
      <stop offset="0.3448" stopColor="#A46E61" />
      <stop offset="0.3526" stopColor="#A46E61" />
      <stop offset="0.3604" stopColor="#A46E61" />
      <stop offset="0.3681" stopColor="#A56E61" />
      <stop offset="0.3759" stopColor="#A56E61" />
      <stop offset="0.3836" stopColor="#A56E61" />
      <stop offset="0.3914" stopColor="#A56E61" />
      <stop offset="0.3991" stopColor="#A56E61" />
      <stop offset="0.4069" stopColor="#A66E61" />
      <stop offset="0.4147" stopColor="#A66E61" />
      <stop offset="0.4224" stopColor="#A66E61" />
      <stop offset="0.4302" stopColor="#A66D61" />
      <stop offset="0.4379" stopColor="#A66D61" />
      <stop offset="0.4457" stopColor="#A66D61" />
      <stop offset="0.4535" stopColor="#A66D61" />
      <stop offset="0.4612" stopColor="#A66D61" />
      <stop offset="0.469" stopColor="#A76D62" />
      <stop offset="0.4767" stopColor="#A76D62" />
      <stop offset="0.4845" stopColor="#A76D62" />
      <stop offset="0.4922" stopColor="#A76D62" />
      <stop offset="0.5" stopColor="#A76D62" />
      <stop offset="0.5078" stopColor="#A86C61" />
      <stop offset="0.5155" stopColor="#A86C61" />
      <stop offset="0.5233" stopColor="#A86C61" />
      <stop offset="0.531" stopColor="#A86C62" />
      <stop offset="0.5388" stopColor="#A86C62" />
      <stop offset="0.5465" stopColor="#A86C61" />
      <stop offset="0.5543" stopColor="#A96C62" />
      <stop offset="0.5621" stopColor="#A96C62" />
      <stop offset="0.5698" stopColor="#A96C62" />
      <stop offset="0.5776" stopColor="#AA6C62" />
      <stop offset="0.5853" stopColor="#AA6C62" />
      <stop offset="0.5931" stopColor="#AA6B62" />
      <stop offset="0.6009" stopColor="#AA6B62" />
      <stop offset="0.6086" stopColor="#AA6B61" />
      <stop offset="0.6164" stopColor="#AA6B62" />
      <stop offset="0.6241" stopColor="#AA6B62" />
      <stop offset="0.6319" stopColor="#AA6B61" />
      <stop offset="0.6396" stopColor="#AA6B62" />
      <stop offset="0.6474" stopColor="#AA6B62" />
      <stop offset="0.6552" stopColor="#AA6A62" />
      <stop offset="0.6629" stopColor="#AB6B62" />
      <stop offset="0.6707" stopColor="#AB6B62" />
      <stop offset="0.6784" stopColor="#AB6A62" />
      <stop offset="0.6862" stopColor="#AB6A62" />
      <stop offset="0.694" stopColor="#AB6A61" />
      <stop offset="0.7017" stopColor="#AB6A62" />
      <stop offset="0.7095" stopColor="#AB6A62" />
      <stop offset="0.7172" stopColor="#AC6A63" />
      <stop offset="0.725" stopColor="#AC6A62" />
      <stop offset="0.7328" stopColor="#AC6A62" />
      <stop offset="0.7405" stopColor="#AC6A62" />
      <stop offset="0.7483" stopColor="#AC6A61" />
      <stop offset="0.756" stopColor="#AC6A61" />
      <stop offset="0.7638" stopColor="#AC6A62" />
      <stop offset="0.7715" stopColor="#AC6A62" />
      <stop offset="0.7793" stopColor="#AC6A61" />
      <stop offset="0.7871" stopColor="#AD6A62" />
      <stop offset="0.7948" stopColor="#AD6A62" />
      <stop offset="0.8026" stopColor="#AD6962" />
      <stop offset="0.8103" stopColor="#AD6962" />
      <stop offset="0.8181" stopColor="#AD6962" />
      <stop offset="0.8259" stopColor="#AE6963" />
      <stop offset="0.8336" stopColor="#AE6963" />
      <stop offset="0.8414" stopColor="#AE6962" />
      <stop offset="0.8491" stopColor="#AE6862" />
      <stop offset="0.8569" stopColor="#AE6862" />
      <stop offset="0.8647" stopColor="#AF6863" />
      <stop offset="0.8724" stopColor="#AF6862" />
      <stop offset="0.8802" stopColor="#AF6862" />
      <stop offset="0.8879" stopColor="#AF6863" />
      <stop offset="0.8957" stopColor="#AF6862" />
      <stop offset="0.9034" stopColor="#AF6862" />
      <stop offset="0.9112" stopColor="#AF6862" />
      <stop offset="0.919" stopColor="#AF6862" />
      <stop offset="0.9267" stopColor="#B06862" />
      <stop offset="0.9345" stopColor="#B06862" />
      <stop offset="0.9422" stopColor="#B06862" />
      <stop offset="0.95" stopColor="#B06863" />
      <stop offset="0.9578" stopColor="#B06862" />
      <stop offset="0.9655" stopColor="#B06862" />
      <stop offset="0.9733" stopColor="#B06762" />
      <stop offset="0.981" stopColor="#B06762" />
      <stop offset="0.9888" stopColor="#B16763" />
      <stop offset="0.9965" stopColor="#B16763" />
      <stop offset="1" stopColor="#B16763" />
    </linearGradient>
    <path
      fill={`url(#${id}-SVGID_3_)`}
      d="M102.64,125.97c0,0.43,0.03,0.89,0.03,1.32c1.17-0.31,2.24-0.6,2.24-0.6  c0.37-0.06,0.75-0.06,1.15-0.06c0.26,0,0.54,0,0.8,0.03c0.03-0.08,0.03-0.14,0.06-0.23c-1.09-0.57-2.3-1.15-3.36-1.69  C103.28,125.11,102.96,125.51,102.64,125.97 M105.14,123.04c-0.38,0.37-0.75,0.75-1.09,1.12c1.09,0,2.18,0.03,3.27,0.03  c0.11-0.83,0.2-1.7,0.23-2.56C106.78,122.13,105.97,122.59,105.14,123.04"
    />
    <path
      fill="#AE6777"
      d="M124.01,112.22c-0.23-0.06-0.43-0.12-0.6-0.14c2.9-0.86,5.85-1.66,8.87-2.44l-0.83,0.52c0,0,0,0-0.03,0  C128.92,110.85,126.45,111.53,124.01,112.22"
    />
    <path
      fill="#A86977"
      d="M155.8,146.16c-0.66-0.32-1.26-0.63-1.78-0.89C154.62,145.56,155.2,145.85,155.8,146.16 M118.96,129.81  c-0.75-0.63-1.49-1.29-2.21-1.89l-0.34-0.29v0.49c0.55,0.49,1.09,0.95,1.64,1.41C118.33,129.61,118.64,129.7,118.96,129.81   M147.78,126.77c-3.85-0.83-7.63-1.58-11.37-2.3c0.09,0.11,0.17,0.26,0.26,0.4c3.07,0.57,6.17,1.21,9.33,1.87l0,0  C146.52,126.74,147.26,126.77,147.78,126.77 M125.94,125.2c-0.63-0.17-1.38-0.34-2.18-0.46c-6.54-0.37-13.12-0.55-19.66-0.57  c-0.11,0.11-0.2,0.2-0.29,0.32l0.03,0.03C111.21,124.54,118.59,124.77,125.94,125.2 M141.26,126.44v-0.34  c-1.32-0.11-2.67-0.26-4.02-0.37c0.09,0.12,0.17,0.26,0.26,0.37C138.76,126.18,140,126.32,141.26,126.44 M125.86,112.68  c0.57-0.26,1.15-0.52,1.72-0.77v-0.32c-0.72,0.32-1.46,0.63-2.18,0.98C125.6,112.62,125.75,112.65,125.86,112.68"
    />
    <path
      fill="#B16763"
      d="M165.18,150.21c-1.64-0.55-6.08-2.44-9.36-4.05c-0.6-0.32-1.18-0.6-1.78-0.89  c-0.89-0.46-1.55-0.86-1.87-1.15c0,0-0.6-0.32-1.49-0.8c2.3-3.62,3.44-7.81,2.9-12.66l1.03,0.23l8.18,1.23l5.77,1.21  c0.03,0.14,0.03,0.26,0.06,0.4c0.14,1.09,0.23,2.18,0.23,3.27c0,4.08-1,8.15-3.13,12.14C165.56,149.52,165.38,149.87,165.18,150.21   M125.4,112.59c0.75-0.34,1.46-0.69,2.18-1l0,0c-0.92,0.29-1.81,0.57-2.73,0.86C125.05,112.51,125.23,112.56,125.4,112.59   M123.71,124.73c-0.66-0.09-1.41-0.17-2.21-0.23c-7.86-0.69-10.88-1.75-11.65-2.01c-1.41-0.49-1.43-0.75-2.27-0.86  c-0.03,0.86-0.11,1.72-0.23,2.55C112.8,124.27,118.25,124.45,123.71,124.73 M141.27,126.08c-1.43-0.26-2.87-0.52-4.28-0.75  c0.09,0.11,0.17,0.26,0.26,0.37C138.57,125.82,139.92,125.94,141.27,126.08 M107.46,126.68c-0.17-0.09-0.34-0.17-0.52-0.29  c-0.03,0.09-0.03,0.14-0.06,0.23C107.09,126.66,107.26,126.66,107.46,126.68 M115.3,128.58c-0.69-0.55-1.38-1.09-2.04-1.66  c-1.03,0.06-2.04,0.11-3.04,0.2c1.03,0.23,1.72,0.43,1.72,0.43C112.97,127.78,114.41,128.26,115.3,128.58 M148.5,142.21  c2.32-3.53,3.5-7.63,3.01-12.37c-1.18-0.66-2.44-1.64-3.16-2.73c-1.12-1.75-3.87-4.79-5.4-6.69c-2.1-2.61-6.86-5.02-7.55-6.11  c-0.69-1.09-1.84-2.98-2.15-3.73c-0.32-0.72-0.98-1.29-2.09-1.29c-0.06,0-0.14,0-0.2,0c-1.26,0.09-1.35,0.52-2.41,0.57  c-0.14,0-0.29,0-0.43,0c-1,0-2.12-0.17-2.12-0.17c-0.66-0.11-1.09-0.2-1.55-0.2c-0.63,1.09-1.64,1.75-4.08,1.75l-0.43-0.06  c0.23,0.52,2.35,0.83,2.84,0.83c0.03,0,0.03,0,0.06,0h0.03c0.11,0,0.29,0.03,0.52,0.09c2.9-0.86,5.85-1.66,8.87-2.44l-0.83,0.52  c-0.03,0-0.03,0-0.03,0c-1.41,0.89-2.78,1.81-4.13,2.73c0.23,0.11,0.55,0.26,0.98,0.52c2.64,1.49,6.54,5.65,7.32,9.27  c0.11,0.52,0.43,1.12,0.83,1.75c3.76,0.69,7.55,1.46,11.39,2.3c-0.52,0-1.26-0.03-1.78-0.03c-1.52-0.03-3.04-0.03-4.56-0.03  c-1.18,0-2.3,0.03-3.44,0.03c0.86,1.15,1.66,2.27,1.84,3.1c-3.47-0.23-7.81-2.04-9.7-2.9c-4.53,0.14-9.07,0.4-13.75,0.69  c0.86,0.75,1.72,1.49,2.55,2.21c3.53,1.15,9.24,3.16,11.11,4.51c1.81,1.32,11.14,4.79,13.6,5.65  C144.8,140.37,146.75,141.32,148.5,142.21 M167.02,127.66c-0.11-0.29-0.2-0.57-0.37-0.8c-0.2-0.49-0.43-0.95-0.66-1.43  c0-0.03-0.03-0.03-0.03-0.06v-0.03c0-0.03,0-0.03,0-0.03c-0.06-0.09-0.09-0.2-0.14-0.29c-0.29-0.6-0.63-1.21-0.98-1.78  c-0.11-0.03-1.52-0.43-5.08-0.43c-0.34,0-0.72,0-1.09,0c-0.03,0-0.03,0-0.06,0c-0.77,0-1.64,0.2-1.64,0.2l-2.24,1.32  c-0.29,0.46,0.72,1.06,0.72,1.06s2.81,0.17,2.81,0.92C160.33,127.43,164.75,127.55,167.02,127.66 M138.2,151.34  c0.86-0.49,1.69-1.03,2.53-1.58c-0.49-0.09-1.18-0.17-2.1-0.17C137.83,149.59,137.88,150.42,138.2,151.34 M157.86,159.15  c0.34-0.32,0.66-0.63,1.03-0.92c1.29-1.26,2.41-2.53,3.44-3.82c-4.97-0.11-12.03-0.2-17.39-2.98c-0.17-0.55-0.57-0.83-1-1  c-1.46,1.12-3.04,2.12-4.74,3.07c0.14,0.23,0.23,0.4,0.23,0.4c1.64,1.09,7.52,2.76,8.75,2.93c1.23,0.14,5.34,1.38,5.34,1.38  S155.65,158.49,157.86,159.15"
    />
    <path
      fill="#AA6972"
      d="M148.93,142.43c-0.14-0.06-0.29-0.14-0.43-0.2c2.32-3.53,3.5-7.61,3.04-12.34c0.03,0.03,0.06,0.03,0.09,0.06  C152.26,134.68,151.17,138.84,148.93,142.43 M138.42,151.94c1.06-0.63,2.07-1.26,3.04-1.95c-0.17-0.06-0.43-0.14-0.75-0.2  c-0.8,0.55-1.66,1.06-2.53,1.58C138.28,151.54,138.34,151.74,138.42,151.94"
    />
    <path
      fill="#987A8F"
      d="M127.28,112.94c-0.6-0.26-0.69-0.11-1.41-0.23h-0.03c0.57-0.26,1.15-0.52,1.75-0.77v-0.32  c-0.92,0.29-1.84,0.57-2.73,0.86c-0.29-0.06-0.57-0.14-0.86-0.2c2.44-0.72,4.91-1.38,7.43-2.04  C130.01,111.1,128.63,112.02,127.28,112.94 M105.15,123.04c0.2-0.17,0.37-0.37,0.6-0.57c0.32-0.29,0.52-0.6,0.69-0.89l0.72,0.03  c0.17,0,0.32,0.03,0.46,0.03C106.76,122.12,105.96,122.58,105.15,123.04 M146,126.74c-1.52-0.03-3.04-0.03-4.56-0.03  c-1.15,0-2.3,0-3.42,0.03c-0.17-0.23-0.32-0.43-0.49-0.66c1.26,0.11,2.5,0.23,3.76,0.34v-0.34c-1.35-0.14-2.7-0.26-4.02-0.37  c1.35,0.11,2.7,0.26,4.02,0.37c-1.44-0.26-2.87-0.52-4.31-0.75c-0.11-0.14-0.2-0.32-0.32-0.46  C139.74,125.45,142.84,126.08,146,126.74 M147.77,126.77L147.77,126.77c-3.85-0.83-7.63-1.61-11.39-2.3  C140.17,125.19,143.93,125.94,147.77,126.77 M100.48,127.83c0.66-0.17,1.23-0.49,1.55-1c0.2-0.32,0.4-0.6,0.57-0.86  c0,0.46,0.03,0.89,0.03,1.32C101.91,127.49,101.08,127.69,100.48,127.83 M118.96,129.81L118.96,129.81  c-0.75-0.63-1.46-1.26-2.21-1.89l-0.34-0.29v0.49c0.55,0.46,1.09,0.95,1.64,1.41c-1.18-0.37-1.95-0.63-1.95-0.63  s-0.32-0.11-0.77-0.29c-0.69-0.57-1.35-1.12-2.04-1.66c-1,0.06-2.04,0.14-3.04,0.2c-0.77-0.17-1.75-0.34-2.76-0.43  c-0.17-0.09-0.34-0.17-0.52-0.29c-1.09-0.57-2.3-1.15-3.36-1.69c0.06-0.09,0.14-0.17,0.2-0.23l0.03,0.03  c7.38,0.03,14.75,0.26,22.1,0.69c1.58,0.43,2.47,0.89,2.47,0.89l0.77,0.37c0,0,0.37,0.17,0.98,0.46c-4.53,0.14-9.1,0.4-13.75,0.69  C117.27,128.35,118.1,129.07,118.96,129.81 M150.65,143.31c2.3-3.62,3.44-7.81,2.93-12.66h-0.03c-0.52-0.11-1.18-0.37-1.89-0.75  c0.6,4.79-0.49,8.95-2.73,12.51C149.56,142.73,150.16,143.05,150.65,143.31 M165.99,125.31L165.99,125.31 M166.02,125.37  c0-0.03-0.03-0.03-0.03-0.06C166.02,125.34,166.02,125.37,166.02,125.37 M139.18,153.47c1.66-0.95,3.27-1.95,4.76-3.07  c-0.37-0.14-0.77-0.17-1.12-0.17c-0.43,0-0.77,0.06-0.77,0.06s-0.11-0.14-0.55-0.32c-0.98,0.69-2.01,1.32-3.07,1.95  C138.66,152.52,138.98,153.1,139.18,153.47"
    />
    <path
      fill="#F9A93F"
      d="M126.9,72.17l-1.69-1.58c-0.11-0.52,0.46-1.23,0.6-2.12l-0.52-0.2c-0.4-1.52-0.75-4.28,0-5.74  c0.34-0.72,0.77-1.66,0.55-2.5c-1.38-4.68-4.08-8.75-5.97-13.17c-0.52-1.21-0.43-2.07-0.52-3.3c-1.46-1.64-3.19-5.88-3.99-8.5  c-1.72,4.33-2.87,9.33-2.87,10.48c0,4.88,4.97,7.26,3.24,15.38c-0.34,1.58-0.92,3.73-1.49,5.97c1.03,5.65,1.03,9.76,2.55,16.33  c2.12,2.09,3.87,4.79,4.82,8.21c0.57,2.12,2.35,7.09,4.65,7.81c1.41,0.46-4.79,1.61-6.54-0.6c-1.69-2.12-4.62-3.82-6-6.06  c-1.09-1.78-2.81-5.63-3.9-7.43l-1.32,6.95c1.81,7.43,0.72,9.07-0.89,15.1c-0.69,2.61-5.94-9.59-5.97-10.53  c0-2.64-0.17-3.62-0.77-5.97c-1.09-2.15-0.98-5.19-0.83-7.52c0.26-3.87,0.23-11.16,0.37-13.09c-1.32-3.27-4.74-9.16-5.08-12.46  c-0.52-5.17,0.34-10.39-0.37-15.56c-0.89,2.58-1.84,5.85-3.85,7.84c-3.01,2.96-5.77,6.23-8.47,9.5c-0.98,1.35-0.11,1.98-1.64,4.13  c-1.49,2.09-0.69,1.15-1,3.16c-0.06,0.34-0.23,0.63-0.34,0.75c-0.8,0.66-1.64,1.23-2.78,0.77c-2.21-1.12-2.38-2.76-2.53-4.85  c-0.29-4.02,2.7-4.22,4.39-6.66c3.3-4.79,4.99-12.83,8.55-16.44c0.23-0.72,1.06-3.3,2.64-7.12c0.06-4.76,1.23-9.01,6.14-10.96  c2.01-0.8,4.65-1,4.74-3.79c0-0.34-0.06-1.18-0.26-1.49c-0.8-0.66-1.38-0.66-1.78-1.12c-0.8-1.03-1.46-7.58-1.38-8.01  c1.15-5.57,3.82-7.4,7.18-7.26c3.99,0.2,7.15,2.12,6.97,7.46c-0.14,4.31-4.59,9.84,2.07,11.94c2.55,0.8,3.01,0.26,5.22,2.44  c2.44,2.47,3.04,6.83,3.44,10.88l2.5,5.8c4.59,7.72,2.93,10.16,4.59,17.99c0.43,2.04,1.18,3.82,1.35,8.27  C130.89,67.35,129.22,72.09,126.9,72.17"
    />
    <linearGradient
      id={`${id}-SVGID_4_`}
      gradientUnits="userSpaceOnUse"
      x1="-564.7075"
      y1="262.6658"
      x2="-562.2404"
      y2="262.6658"
      gradientTransform="matrix(26.2212 26.2212 26.2212 -26.2212 8000.6489 21739.6152)"
    >
      <stop offset="0" stopColor="#7076B8" />
      <stop offset="4.280000e-03" stopColor="#7076B8" />
      <stop offset="0.012" stopColor="#7076B8" />
      <stop offset="0.0198" stopColor="#7076B8" />
      <stop offset="0.0275" stopColor="#7076B7" />
      <stop offset="0.0353" stopColor="#7076B7" />
      <stop offset="0.043" stopColor="#7076B7" />
      <stop offset="0.0507" stopColor="#7177B7" />
      <stop offset="0.0585" stopColor="#7177B7" />
      <stop offset="0.0662" stopColor="#7077B7" />
      <stop offset="0.074" stopColor="#7077B7" />
      <stop offset="0.0817" stopColor="#7077B7" />
      <stop offset="0.0895" stopColor="#7077B6" />
      <stop offset="0.0972" stopColor="#7077B6" />
      <stop offset="0.105" stopColor="#7077B6" />
      <stop offset="0.1127" stopColor="#7077B6" />
      <stop offset="0.1205" stopColor="#7077B5" />
      <stop offset="0.1282" stopColor="#7077B5" />
      <stop offset="0.1359" stopColor="#7077B5" />
      <stop offset="0.1437" stopColor="#7177B6" />
      <stop offset="0.1514" stopColor="#7177B6" />
      <stop offset="0.1592" stopColor="#7177B5" />
      <stop offset="0.1669" stopColor="#7177B5" />
      <stop offset="0.1747" stopColor="#7077B5" />
      <stop offset="0.1824" stopColor="#7077B5" />
      <stop offset="0.1902" stopColor="#7077B5" />
      <stop offset="0.1979" stopColor="#7077B5" />
      <stop offset="0.2057" stopColor="#7077B5" />
      <stop offset="0.2134" stopColor="#7077B5" />
      <stop offset="0.2212" stopColor="#7077B4" />
      <stop offset="0.2289" stopColor="#7077B4" />
      <stop offset="0.2367" stopColor="#7177B5" />
      <stop offset="0.2444" stopColor="#7177B5" />
      <stop offset="0.2521" stopColor="#7177B5" />
      <stop offset="0.2599" stopColor="#7177B4" />
      <stop offset="0.2676" stopColor="#7177B4" />
      <stop offset="0.2754" stopColor="#7177B4" />
      <stop offset="0.2831" stopColor="#7177B4" />
      <stop offset="0.2909" stopColor="#7177B3" />
      <stop offset="0.2986" stopColor="#7177B3" />
      <stop offset="0.3064" stopColor="#7177B3" />
      <stop offset="0.3141" stopColor="#7177B3" />
      <stop offset="0.3219" stopColor="#7177B3" />
      <stop offset="0.3296" stopColor="#7177B3" />
      <stop offset="0.3373" stopColor="#7177B3" />
      <stop offset="0.3451" stopColor="#7177B3" />
      <stop offset="0.3528" stopColor="#7278B2" />
      <stop offset="0.3606" stopColor="#7278B2" />
      <stop offset="0.3683" stopColor="#7278B2" />
      <stop offset="0.3761" stopColor="#7278B2" />
      <stop offset="0.3838" stopColor="#7278B2" />
      <stop offset="0.3916" stopColor="#7178B2" />
      <stop offset="0.3993" stopColor="#7178B2" />
      <stop offset="0.4071" stopColor="#7178B2" />
      <stop offset="0.4148" stopColor="#7177B2" />
      <stop offset="0.4225" stopColor="#7177B1" />
      <stop offset="0.4303" stopColor="#7177B1" />
      <stop offset="0.438" stopColor="#7177B1" />
      <stop offset="0.4458" stopColor="#7177B1" />
      <stop offset="0.4535" stopColor="#7177B0" />
      <stop offset="0.4613" stopColor="#7177B0" />
      <stop offset="0.469" stopColor="#7177B0" />
      <stop offset="0.4768" stopColor="#7177B0" />
      <stop offset="0.4845" stopColor="#7177B0" />
      <stop offset="0.4922" stopColor="#7177B0" />
      <stop offset="0.5" stopColor="#7277B0" />
      <stop offset="0.5077" stopColor="#7277B0" />
      <stop offset="0.5155" stopColor="#7277B0" />
      <stop offset="0.5232" stopColor="#7277B0" />
      <stop offset="0.531" stopColor="#7277B0" />
      <stop offset="0.5387" stopColor="#7277B0" />
      <stop offset="0.5465" stopColor="#7277B0" />
      <stop offset="0.5542" stopColor="#7277AF" />
      <stop offset="0.562" stopColor="#7277AF" />
      <stop offset="0.5697" stopColor="#7277AF" />
      <stop offset="0.5775" stopColor="#7277AF" />
      <stop offset="0.5852" stopColor="#7277AE" />
      <stop offset="0.5929" stopColor="#7378AF" />
      <stop offset="0.6007" stopColor="#7378AF" />
      <stop offset="0.6084" stopColor="#7378AF" />
      <stop offset="0.6162" stopColor="#7278AE" />
      <stop offset="0.6239" stopColor="#7278AE" />
      <stop offset="0.6317" stopColor="#7278AE" />
      <stop offset="0.6394" stopColor="#7278AE" />
      <stop offset="0.6472" stopColor="#7278AE" />
      <stop offset="0.6549" stopColor="#7278AE" />
      <stop offset="0.6627" stopColor="#7278AE" />
      <stop offset="0.6704" stopColor="#7278AE" />
      <stop offset="0.6781" stopColor="#7278AE" />
      <stop offset="0.6859" stopColor="#7378AE" />
      <stop offset="0.6936" stopColor="#7378AE" />
      <stop offset="0.7014" stopColor="#7378AE" />
      <stop offset="0.7091" stopColor="#7378AE" />
      <stop offset="0.7169" stopColor="#7378AD" />
      <stop offset="0.7246" stopColor="#7278AD" />
      <stop offset="0.7324" stopColor="#7278AD" />
      <stop offset="0.7401" stopColor="#7278AD" />
      <stop offset="0.7479" stopColor="#7278AD" />
      <stop offset="0.7556" stopColor="#7278AC" />
      <stop offset="0.7634" stopColor="#7278AC" />
      <stop offset="0.7711" stopColor="#7278AC" />
      <stop offset="0.7788" stopColor="#7278AC" />
      <stop offset="0.7866" stopColor="#7278AC" />
      <stop offset="0.7943" stopColor="#7278AC" />
      <stop offset="0.8021" stopColor="#7278AC" />
      <stop offset="0.8098" stopColor="#7278AC" />
      <stop offset="0.8176" stopColor="#7278AB" />
      <stop offset="0.8253" stopColor="#7278AB" />
      <stop offset="0.8331" stopColor="#7379AC" />
      <stop offset="0.8408" stopColor="#7379AC" />
      <stop offset="0.8486" stopColor="#7379AB" />
      <stop offset="0.8563" stopColor="#7379AB" />
      <stop offset="0.864" stopColor="#7378AB" />
      <stop offset="0.8718" stopColor="#7378AB" />
      <stop offset="0.8795" stopColor="#7378AB" />
      <stop offset="0.8873" stopColor="#7378AB" />
      <stop offset="0.895" stopColor="#7378AB" />
      <stop offset="0.9028" stopColor="#7378AB" />
      <stop offset="0.9105" stopColor="#7378AB" />
      <stop offset="0.9183" stopColor="#7378AA" />
      <stop offset="0.926" stopColor="#7378AA" />
      <stop offset="0.9338" stopColor="#7378AA" />
      <stop offset="0.9415" stopColor="#7278AA" />
      <stop offset="0.9492" stopColor="#7278A9" />
      <stop offset="0.957" stopColor="#7378AA" />
      <stop offset="0.9647" stopColor="#7378AA" />
      <stop offset="0.9725" stopColor="#7378AA" />
      <stop offset="0.9802" stopColor="#7378A9" />
      <stop offset="0.988" stopColor="#7378A9" />
      <stop offset="0.9957" stopColor="#7378A9" />
      <stop offset="1" stopColor="#7378A9" />
    </linearGradient>
    <path
      fill={`url(#${id}-SVGID_4_)`}
      d="M99.29,7.96c0.03,0.34,0.2,5.63,0.98,6.75c1.52,1.15,2.38,0.8,2.3,3.65  c-0.08,2.38-1.61,3.79-3.67,4.53c-3.36,1.17-5.08,1.86-6.2,5.34c-0.34,1.09-0.66,2.67-0.66,4.99v0.15c-0.95,2.38-2.18,5.11-2.9,7.66  c-4.13,4.16-6.2,13.57-10.39,17.56c-2.78,2.64-3.62,2.81-2.61,6.89c0.11,0.4,1.43,1.47,1.72,1.64l1.29-0.8  c0.2-2.07-0.08-1.89,1.24-3.79c1.21-1.75,0.63-2.67,1.69-4.19c2.64-3.3,5.14-6.63,8.09-9.64c1.98-2.01,4.68-8.81,5.31-11.19  c0.11-0.34,0.31-0.52,0.4-0.23c0.4,4.53,1.06,8.32,0.89,12.8c-0.34,9.39-0.08,8.41,3.82,17.16c0.31-3.53,1.17-8.64,3.21-10.36  c-2.41,9.13-2.56,22.16-2.81,26.14c-0.15,2.04-0.69,5.25,0.29,7.12c0.31,1.26,0.34,3.18,0.37,4.65c0,0.89,0.06,16.01,0.06,16.01  l-1.4,7.03c-0.49,2.04-3.13,5.43-5.05,6.49c-0.6,0.34-2.07,1.12-2.07,1.78c0,1.12,7.14,3.19,8.78,0.66c1.23-1.89,2.24-2.93,3.7-4.34  c2.24-2.15-0.26-4.39,0.06-7.29c0.52-5.08,2.7-9.5,3.42-14.32c0.43-2.9,0.34-5.45-0.95-8.76l0.95-9.18c1.06,1.58,2.04,4.11,3.04,6.2  c1.78,3.73,1.81,4.08,4.91,7.15c1.03,1.03,2.12,2.24,2.9,3.5c1.46,2.3,2.44,4.59,2.32,7.35c-1.06,1.92-1.52,1.81-2.9,2.98  c0.06,0.06-0.38,1.12,0.92,1.12c4.65,0,4.08-2.44,5.82-5.56c1.15-2.04,4.39-5.14,0.83-6.2c-1.12-0.34-2.18-1.01-2.84-2.1  c-2.47-4.13-2.58-4.04-3.87-7.86c-0.78-2.32-2.38-4.19-4.25-5.68c-1.15-2.61-1.61-4.45-1.98-7.23c-0.49-3.76-0.83-6.43-1.49-10.27  c1.81-7.2,2.76-8.73-0.34-15.64c-0.72-1.58-1.12-3.27-1.12-5.17c0-2.3,1.26-7.46,2.49-10.16c0.43-1.09,1.03-2.12,1.87-2.44  c0.75,2.79,3.33,8.53,4.82,9.93c0.08,1.12,0.06,2.27,0.49,3.33c1.89,4.53,4.59,8.64,5.94,13.43c0.46,1.64-0.15,2.44-0.63,3.76  c-0.15,0.63-0.17,2.47,0.11,3.85l0.66,0.34c-0.11,0.4-0.4,1.58-0.63,2.09c0.09,0.66,0.89,1.01,0.89,1.01  c1.03-0.23,2.53-3.99,2.47-5.48c-0.17-4.59-1.12-6.66-1.41-8.01c-1.52-7.78-0.66-9.93-4.99-17.48l-2.47-6.14  c-0.31-3.13-1.55-10.3-5.57-11.59c-0.69-0.2-1.35-0.26-2.38-0.57c-5.25-1.69-5.25-5.74-3.82-10.16c1.29-3.93,1.44-8.55-4.33-9.04  c-0.17-0.03-0.34-0.03-0.52-0.03C101.04,2.19,100.03,4.89,99.29,7.96"
    />
  </svg>
);

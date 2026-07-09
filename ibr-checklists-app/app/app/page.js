'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2, Circle, AlertTriangle, ChevronRight, ArrowLeft,
  Plus, Trash2, X, ClipboardCheck, LayoutGrid, Settings2, Clock, Lock, Camera,
  Users, User, LogOut, Store, BarChart3, ChevronUp, ChevronDown, Calendar,
  WifiOff, RefreshCw, Bell, BellOff, ExternalLink, Award, Star,
} from 'lucide-react';
import {
  fetchTemplates, saveTemplates as dbSaveTemplates, subscribeToTemplates,
  fetchCompany, fetchUnits, fetchSectors, fetchChecklistTypes,
  fetchUsers, saveUsers as dbSaveUsers,
  fetchCompletions, saveCompletion as syncSaveCompletion,
  fetchClosures, saveClosures as dbSaveClosures,
  sendRecognition, fetchRecognitions,
  uploadPhoto, getPhotoUrl,
  seedSupabaseIfEmpty,
  subscribeToCompletions,
  requestPushPermission, hasPushPermission,
} from '../../lib/sync';
import { getTenantSlug } from '../../lib/tenant';
import { useNetworkStatus } from '../../lib/useNetworkStatus';

// Thin local storage adapter still used for the version-check key
import { storageGet, storageSet } from '../../lib/storage';
// Event instrumentation (MVP Inteligência Operacional — ver docs/REVISAO_MVP_v1.3.md)
import { track, setTrackSession, clearTrackSession } from '../../lib/track';
// Execução colaborativa em tempo real (H6)
import { fetchLiveTasks, setLiveTask, reopenLiveTask, subscribeLiveTasks } from '../../lib/collab';

const LOGO_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABEBAMAAADD1i77AAAAHlBMVEUAAQEHPF0EL2MHPFwIQmUHO1wAWl8AAP8AAAAAAAAlhJ1KAAAACHRSTlMA6xee/l8EAdSX9pUAAAV1SURBVHjabZZdbxvHFYafnSVHEmKJnCUpGZJMDakPFwmckpRkOKjrWKaMXLQXlGW1QI3GWxXxHyjQH9MroVctirbxXS5S10bRAEFqi4YVR7VsZSXVlmLLXOoz4lrc7cWSMmN5bnZm58WZc95z5j0DzaFhMG8Jix8OcTRzsviONiMCsrxliPzlrFEiarUJqexjFrTE2nTEUw21SD03dwzgeH65OkQs7kf5VbosoK1hxQw/wxV98iC7Ugm2O34ZbFnPoF4OdwwA7AW/GlTZfWd7wK2KeGbel4fvP/SaRwh77tS3/1uNFk+ZMUTWyK/6cF31Hh0RlO0vT+4dRrc6q6Lt4EdBMPC0Xo/0PKoFDUc/KUjTSgilcjYyK6aFJTDV+GWpGz5Ez3+7qox+I/M3tAPMflrhquFuVp1GpKWpFGOpFGhg5IbAlqJojI9EtQ0go8WsKmVKWfmaP/EbK6+5agEm9Y/XNoJUuXOhGTkQ7JzYWB9czEdfYkL5xbn2/56ubF1vAuwy7rasiZ++kzhXBhumrN+WQLSmaDg3le+O2hrAJqpKMlrUslkZs0iixehZO4wBWw+d1cZkQoeZi15CaimUlgxr24z05P400/V5VXRt17pLZTtzYTOe2HvV9/P+xd1ht/szI2ukYzdTz0FM3fF3PXuh37g9yvyOZ57ZqUTqFdN1jY7RvkXEx3+WpEpzXnWRjt7Nl1xfqib2jJo5s+/k3UcuxkIXeHfNyMkqub9uBxS26svtxqH5/LT1z/Gv6hj69AY5c7N9Jxjd3+txmf/oi1Pn3E7zJImtzZcQbBltz3cS37UHk23r6Xngof2PxWoVxGCyu1F34yplTqRAzh7xdQVpIzUA2eSkUhmlEoUGpdlppSzABpiFG4N5pZRSk0VChsfU+AgA0gaEBIRSJTl8pcF4HsSM0Syae84nFYdlhk51zcleB2Aq8tiJhPdCBj1r7/7b6uhYJ7N/54z5rA7YXz60eBoCTKMSDGy0fdPhsr5BZiW5HUDZWl93ZQiop1+0bUSWz30l0dXkE1Hbt8uwO32gTjR9+HH8weHQcmx3YCXojzwZvbfrQaaKGYQWRKZ319UrHy71B+5E2a9JXY9XUR9gpsIaSefv/6e+G9w883U8//dRJ7/wYHsdDXQ5IeDi4U9+V3jcOXW/v+wHnRGuxXjFRbbj/msFEleESBaSBWUjxmUjEzNH2yM2YE4MTgildcg89rTmRotIaTKXTSujtCZMpkiqwpHCAFUmv9ivQTvVeQBpfHDwvKNHtNhw0nogBxfDlefXn6h03GwBeP6lB9+J7s8aS2Ns/NZGe6tSKi0SgxNNqc0mNL9vVVIpihKdUakwxjYxltKyVYo9U3iQ430PgJq+H+x5rQDpA6wZ1cYdtn6mAks3AFKTPfTrUgjnwoIHIM3OvSUl0MZrJzJbFZj5S0NEdld9/97wKycSBjAN/i1mgPG+T0NS/PsX9FLDB3vAdd2tnOm6rhvbA+CP84l6fHs21Mkbf8hUj3qIb/3LA9AFbl6605DrkanXjShalA1a1FjOBgP06C2CXwAcRvjcTIcW0EZ27VEopJNKdR+zAOKsAEx+7a50nX/yPYC4+t5BPP64ARj4OgAEt0dN527jl+sOVI7IdWyACOBpED4QcX0nnAEwFwKcMfGsj4gHLAEZpNeaZBO+f/dw5fwSyKDQe/69/W/2g1aAgQxiddjzkK+KwF2j8kZr9q59CPTaHEZc13XN9PGmzMhwMt7QreiEPt62b0CmCEiRzU5dfltjb8tGkwWkzEyopGW/5XlQW+67GCt5nohT77r9Q0CzoqKx+tBL88Rauuy//YFxLWaecN24ce/NIJoWpDdYgaEXq28Y4P9JDehlYotRagAAAABJRU5ErkJggg==';
const LOGO_LOGIN_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADVCAMAAAAlzk/pAAAAP1BMVEUEKmUAXmAHO1sHO1sAPj4HO1wAAP8IQGIAVaoHQGAJQWMA/wAAAAAHO1wIQGIIPmAAAAAAAAAAAAAAAAAAAAC2HQLVAAAAEHRSTlMVA6FeBNAB1gNHjQEA/P7+y1GA0AAAF4hJREFUeNrVXYma6yiullg8M/fa8P5vO0ZiERhs7Dipnsw33X1OVRJkbb9WYH39ZRC0Vsoq/iOs+v+0hvXLr3e/AHcClN22zXvvNv5ssyq3Ob3/+3+IENic81t68Wfjqnz4b/xnE4JYfZgtZAQuoCCk+01g8J9ACPJBy5+DFAXBIr5YQYhTY9Eyf0wIhAOAVhbEkZgQq3btBsmmnTu9b0L1mhV4+jnEB1B2V2qdmUIP36vmM43d+spuVu3cTjX8MUe03cLz36UG84cBnRnMboKFBdiFTXeUHTGoVLBuy58RsvNiy/YJpNlq1YGI61qtpFEW/5AjYFmr/VaLDdhwMGN2nuTjRkLg8M30g83/JSFBusMhlCalELJlfcWhQIj2W/N3wr8EQv5Q2Rd6mjsrmsfN0hIASgYlTLOFIx162/6ckP1tiRXKC9mK9jf4kfSXREjvsBidpzAWf0BIlK393XzM6KCTyAnNYdoOHIm/abdTX/kVQhAqwYiyBSDtVlSI+KBNkbajQjND1PYWnpwmBJvfBRZvOqdToMhRRBPlwtFV8g77iQ+iZYhip7T7MSH7IXftNQebA2ZhnWXQHk2qKgAlPPqOHiDDSwjypX+qI6C9lZQgyfh+wOgNku/e8Uh8/CBY1+oBRoaQ2MHwEIhvE4LsACUlACqcX9uiExgZZRfApXJ7rfhA5GdE+OOz4auEBMlnYyQw7BLVoY6jTHzGTAeaYhVMz1QEsbPjr62l+QWOIKh4XkFJwuxBPyzLlolWdWcDojFFq31LCL2V6PEjN0I/ndefOUKSIkhKkmv2mwJIskV/uR+bSQXFjqbBjJgAsYGxGwEASz53UvpnlT3FsF7wJCDEPQ6E8F8s8hCB/H6KHafsADkTgib8z8SYUkVvCmM3Ehm+W/Y58ZojpIhR4InEI8Fu7a6STBj9hKkjmMKHVS1Cyfy1Wg8iFfGNzsLUISetVvQPZLsSJRmgF/e4JHskDAAdyCp6UQScz+jdIFJJqrXx/6c85rRDpC/XFSUkUaTHWVhA8o7xMRG2R8QBSDoXBWprk0a9B7eTkITg+pzjX8DlgPF2gSVlqIAt6TgmI8u/6DmPEhIp/5YZov1lmEfWMj+8hd6hIFkWotipDzgCLbYiz4dJrY2IYjErPkaZsCxFQbWB9cX5HEXxm0L+ZRtYX0SWT51CUacecwSCN8IDS/RaU8LRyH6oJCY7dwCgNqOUClbWkuqu8T0Ee/rWF7Ki7+dnAOEuHQoMvWprLjAKQkIrmKM/Ff27L6Z0t7QG4eAZdpIorWp3ahEG1lcGNYETdiqKhLGV8pUeRuHXEIWM+cUwhbGKVSRka0sA7l4eCv7b2fcvgfkPRivFNJpyRZZAxTVD+oRkS69xwToCUdGjB95gyZH6bSZnGNxizu5lQqCTDiCBzYbcT0TDMMpbuQhpM+dzdKu2bG7o6e3mR2mC8HO4CI2IBI4xMCn6/sUANbB+QAi9i/nrJUJglmSoqIARCfMCb0dH4Snsyg9dBQEOeNjfFK4B3NWRAgmzN0ouIn08W/eHVCR9aYQ/CnXALWxc6iIR3uMIhQGQ804q62PCwG5HiiHFrpgA82K1iOSJZEmxuVe7vmNmFwyBF3TBSHhOJrpVgm1GsD3gdoYnwZjgJwH30qiVId30wTozetv1SfozvRWqLgiJoqlJJ1OGN/s/ZNBKsrQ/Ow3v1tMSUIPoEytkjGTGhlkw6NLBYQBGl5EBKMa6JgcV8HalNnuQCH48WQJMGhrRygALw1FIszztj93YOgoR6bhlfbm+idmDGDwwxBS30q+rHp+qiT6OFEVvVTxVlZqXd+lInlCRKLCnSqdbwklcAf4wpewFspVQPeJEYnkXeb9jsShpicVkmZIeFEFOV01gGEQF1rKY+fIgvls0XxTh3cwQIVaOZIQBR1dN4DReZgpUka7wHVZ/r4mBbK2pGRLVPGht0uBOjRhOAtvMSZ0pSa78Sy+U6RkoaSfPf4aMZmEaooiQQDj5ZHm/SgmmnB7y+WKFrkr3H2EkDAs5kRBLGYXk5PWKX+4pifJAFQv2gm4TZpdCaWdnOSIpCXWOKKZfs1fNmViMsaiHZ+XHqMAK1mlCiBK/lVTo/olOWHAEY75EFe5hOgl09uZKGqs9Xu5ZTTjBxVDgesBWusDg+Db4lvnSXi8Yn6UvWT58lqDLoNFlCkRfhlIfRSJ4AVYi2I0pU8pCueS/8G6mETMllFApaREqmDjHseEjUnDCeCGxgUJU+sLz3Bacf54pAbrsOIl+KUTr8Ax0aXsKD5bkAbLFh0O2sf5auHpGOockSwu32fkrfcwAzaizvWJljCEywfWXtKEQlF/qguNohveoFnoZNEoFESnX4LYBDgIxAYZXk9FL4XuMCeuDUzK2whgQP5nqNaaThQ1u3ddZZKwISbEvzqrFfkLP7U3QtjRiJ6HClrjhaLA2oYyEFSHRW+ruafaYQP+r0bPwSKscO+nKaYpDyVRIBB2xCxU4l6qpDweO4NU3EJGQy05GnbeDIo1uO3JFUTLocMT/X7XaKq44eyJfOaEhawbUJBVz29Qo7P3WAFLMYFdSt5Yvh0q0gkWIrq+WkSADIRnUBwShobGiZVjtw6ogWjQsVBsazqpKFRLY9RqLhsMeJXkOkqqWt2iblPeFKyjR26ZwIPGhmuC9YMqQEpsaV4RkdV8NJakC5+khYCEjwJa6nw1yLJnapwQp2PnsOoULUsT8qCwOVawN25iOFpWSmng6QdLwnNbO0LIyv0SrE+IOJQ173iuS5DJ+fi8LAAKH4zIkxHWcd+hE1VLDY4XUQqwpY8chQspUECkGuJv1PBXO1TUnRKOX8/OFEOhKFhWz+/4o1IEha7j3Vse4q+5ehUrsEynsGbQfVV1bUrQU8vYwWbuB0KD2LR+o6KjH+b6iGgzvINawKpZA/ZVZCl1MWVwwBOhhQe4R6hX4cy4DmrwOFdpD3TTSgCNYW8gAYQSxat6jnxisSYm5Rv725cJbQ+NSAiVLN5XB2ioNdm6hD73bw4fFn89kQCr4BYcve9XT40tPI0BKob7nxTtkC+wOJrSRkmgQwWgrf5dd++7W8SLyzdyIZQx+MoqVIIuWSvKJDNrCxya3Ms7ip2jY+Z4zqP1JSiDXZESOXCZfDeEhBRL+QsobRmmjY1OIFOtnLPKY3copQ1rsOKQEsp852CpPan4ZchMZy0FYncA0EI2Iy3VZQ+mjFXdS3BlDsNLbhpIKO5x4QDa8SptTCYZes24wxAJQlbQRV2cZ1htSFX3KEGgISf0nbe4fzwnhb77oZQI8otBA/WqWwhGprft/WVYYinLgMoZzPiM/SwNvCQ/Kwt9IAquQRp9KV8fKNOELRPvppW2PZfNLVxjeSl1YOvWfZPNa/E/d+MS+I41hSUruZskaCwEkfKittD/O2anhpya8I+OofZUnbjLiFL/t38kjl5uc9oNbffrQyf1yvEmTRiIHTz2X1+VLajTZ/7l7NOqjEc8/vR2sePK6QlFMDg03PJ9ZiOcXKcPQQiW8m7vxkOBobOPRKl0PbGJQgznjyuQ8K1aEJqT2BJkWsu43J1Rg5aA76ErphRGtUIWOAEZymzY+TiBDwVWhfaI2CEnG4iDY/BhBSEl6jrql/nLmCkUvYIa4At4ROcbcYoNkpqVutmPwgIkxzs2XCsG6gVus3WYF2PEDNkQSNjb9FvrF0Chk82ILWz8Kt8GQNXGU5+ESogbXB3YqdENGCyHc78Aw3ZsFBjNIJwRkACNcst2eCC1s8M1zgZOkLdwqfqiB89bDn8SAej59r1s21KHlO1WnXYDoS46M0Se45I7vqIBOFM8qPH6tfJZ8deqKb7FURO2VVbvx5QlDJzZkGpI1f4uQnPonQd4aUvyO3hAipY5f3t8brgIeMFfShGO03q9yJH4uf4dqZUgqLPUzK3WTDjE9myJ8FJH+q5XZMMdDufUmmLImmHTET/YicM5RIyQ2VB5F3yNkGQHqQ9s16MYxhnlqDIIXZpYIZt6sPZK2h9RJYUP2KN7dIiRyszkyZtQGXOmgakft6WscZBAecUT7LKOtR+kUg07pKGrGh1kw9pCndSgFODcunqKvACmXI9aaxnPhgw6OnU3xDY7sIbqNhq/KkAjIc5phiF4mDmSsD0r0EFuu8ndxEiaaMZh+INTRQQ8iHgZQgv7ZV/wEblC9xxfrS0qJky/ZFM9HTovc3cIuz9pDknH6Rds39K2eKZPgJz26HIolUzzPEfX00ENiPG8SMfNmy3vpEyvDMx/Lwo3HPUtzyD7hJFd24bbSrTdieUfZt5E6VBLmw86HGyozKIuPYRB07fcd80ujVD1awoPKuRKCgnjBiPpPGuaaQADMzbGLcTEEdS/oEPksmjg+lKWKR6H0RC8ymdR6oMxTrBzIBP0tKAXr4RAEQMJwQfax5qBPtBIhJ1J6hV2vZhIEbbCHWV3wXqM+drMM1DqtS1oOzKHeaUVYBGg6lsNdj3+Gj7VWZZAAPEj3gCMm9Q8fayEgM3D51MUHl5CXwkLoGHN/NSfN/Qve5X4J7v6wMvc8S0dH1X0eLoh1fJFaVFqX5mEr8nZQiu1uonMiu/Z+3On8rWjTVPKgs5UCmRWlhsF4ZK9X+QOQs3h57k81nRNnlKDtd7BEds7D6LqasQkepF56mjouww4IIMaoZZ4+2zUbQhe/HYblR6jRAgeYpbjkuBUKHtBBTQGpZKeL0w/VHUgKEnTH1GwQFOYcvdNVntKPKYG4IYJffPhM1DQhMvMZPqxALxDNDCCRTJgIEsZh/8li83swM86STXe96mOHkDBoF4LNqlcg2EgNd5FWHExEm590slKBOQhllgllrcoLztHKoXoxTLHXw7olxnVqkKfWQMB7mF2VkK2nTX24WRRK76ERA9yUv/ZVMi79BYljbghMyzuuehQwxroLecZoFCkssts0IaJ6AzxrpbOUxG8IBa7810FbmmquhbJZo2xQoWH/VXR9j9t4YvaBsxYYUXaR3ClCFsEAsQ0zekOe8oG1NcNYe8842RQgtBgh3+JeG1MUZaAmUNCBVQeghLMLXlyo4pSOhuoQnJTAtW+GGy0OtUpomob47Xk8ok+I+MBYUcqJgJ20f88SEtpBbZzNLYnYIs4GCuAKpSqTFcRWbR2Y6C66H+PthZtEvbMwGaNWGxielvC2qrmO65vSjQspSz48djSa9mQoE067/uLQ4PgtIi0vSpyU9ptPPiCsVSOt9m2zgnR4UDxIJsm2oQN3Nzorm+4vzpASx5Z66IwR6ebHuV/4Tx1BSE0HENoCtS40XtbVnalwkrnDmqZipxYykU/paB9gLhaS66twiuzNPETPtw5A4SF0LdRzjmAno5lGngX4yk2mPRh1J0W4svYgyt6TFwjpqWKO2YWCrALBdKYhzI3SsTtbLwFv0QFi/hIklEVjL+DgdDK+tMcdaXmNkIKGd1+fVhcZOfj70YbMYhN97MJC/IpoQRWRB2tEfYRQgO2Hqz5hqzqXDrS8Q4gEkdQ2DsoqqCdUPyIkmz631S2YiK8SAgVEyklBrEKmTwhJm8jE0EpDy0uLtaFtm0NeSGLd9gohsTjdNC46sbII3pSsHS0uw/TRJ4SkhWt5x3tu9su0wJs2q7KwbTvtJwuK5cAfN4FJWgiEv6QjtgR7nbRLixofUCJBTm6QiwPi9q3OhxyeKLnH5Ji2f7zzoswWZZzItADVdzlp+46K+K3eci/SR/460zODf3yOaCpa8nT6O4SoZixQJh5s6QZ6/AWhI8d2rAWaVx1iBIzii4xMviv3sWwxTO5f/IH4nvmF7SBZKtd9Sl37qQGm3QiPluk9RL54APVVQv7h5QM8HxuWR8GXCUn7w5SM6VXYXGp1U9Z+IFtxW7PVFzE9vKbrtVECnobGqhfxiU+M60B5ah7gm4QkLejezNFko/DuVSNLxmtMivkeIUt3nw/tAG3iiIeuBNLkGo+MmW8REn2fV6dxxEcwJfex+W3YJgFv6Xrfth7ynPfVPWx1LvvOhh0fb3BEnSy5g/MRxRlPiCuKAfA83P2+srdrP9riTKyrPLFbCJbHsY2cV+Xh7rcJaZPqw+QKFQ3uaTsvyaAUMy1JyFrvj2s/4AVd9+M6U6rd0rYxSzWeO5X9JLQpZZK1fvf1prbk8Lmu884PewZeQkEpJHrtHckqvjTVyTCM57n+rMMLosWet9d5W2dLcV3vdYyI22XKHqe8BsHXixU+V/YTLc4gGNJGnAdQtJ72l1PqVf3342sECyHmjJCHn7vDkrysIk+aRltcL5iGj1UkbXHt3kpHiyIfYUVIAI6xlligvCS3Au8SosaEANUC7kwgNXab+yVSETLPilPPmVKV2XpIyLJwNz+mSykPbfbLQr+jeMMB4s1WvXgFG5fxlWsXfDwrK5zOwGl/2q9QhxY3fZNNt06lW+FATrLerlg1b0A5X1F6NdMaxeqneQwDYg/iLUCd9yqVTeNwcofCTPAfugXya9DCG7q9O79QcltW3VAWXe0SMtmn68fxCC3k8+V12lZ9/mPn1ax0pS3Waa9SWcA86oKaGFm373X3u+kBMdncFVs/9HjP0gQheKO5f+Z1q4cypQIgLpjbTu4i+T0h86YLaM4t9yaYdBdJd/XBE0L8rZdzor/1Tjxiwp7xcFkEquoGmv5FSzArq8n05Je69bIP0ihA656pHwR4g/zJ+pwbHAm3WzzfJ6ufxOyQn6TODZODj7ggZEEZ3dTvnHshT1DGCxDvJh+olzatODzJ1owJKSOkJVj9BGAaUO5Z0rQgLf6XueFHYufPEjq9cqP7ZxdC5Kvb7iN6EEMcfriUdnAjDI1fUp/ax3WzlpAHH6P9tfnuc4TmJP3HWduXCBGF1bEbgmOGUt7H8I8gJLcenIwAdDgCarDjBP6MkDhLdPowjwtelKtWq71MyEPGUqP26UOAYfacFl3Yzb8jWqny+/R5hPQezod/aTkyF1X4Vj1/jxCMfTW8SoBac3lN9CvPYzqOzT2vlpurZa/iZ1d3HpojHjBl+osLsOI7MtZypd8kIbRQRmDKNDKoyx0m+AOOlPmPLMopAzvLEeVcjd/TDYMfNz/cIQTL4BMeU6ITJ4DLoXdY4Rc6UrJtpiFk5ia/mWjya/d+NFbr0GucCbFTHwbbOUss/pQQAQXK1MScru+oP0e3x+zQ806njzkCYgppzkSW5UAqZ+v8O03Mn+iIHKd6cnMyJ1CT9f0VIalGkFa8yxBx2pWV5UByebP+smMf+JFqOazys2eAbk/VAoDjYZivEAJiJtpAzaVLR1KHwiHpwGtBA39uyuebWCtf35oHcq77YXLiZBh2f/H6qP4dqnHSnfZ1ZkB88TRLqUSm72gxaErPebX+yI/k23dSGw7BpykgX621EFDLubK45otG6xhYlQypp7UQebf96ePEmTXL3zRao8tP8xKgZtHmSaLDvZqL/5iQdbxl5ux5zi2+/qKKdFuT9KBGZc+uJ7iCixfZnC8Qwm08vc1N5yIOYgudtd3q6Tfv7hulTHm33OabbfBw4RPjC2SuXszt4m8Jib7QxFuZypM+NZ/DJPcS71OzX70T8rKsUBDfs9xBGXOH9S8IKZJi5DpoexsslUugv0rH3LGg3aF+CeNJUUK5SuLFvyekpsTcyqKVitd3b02dFJRSorg6EYgN8iIx922G3FhvqEvcfXImTcmHnHbwbvsNQ9Y7LRX5UGYkXjhI0HmL377IFm78ptwf1N+7MOy/+bZg3WoFLKNs1Clplg7eGoKsr9+PfIfjWJ64V537W+Nklf9lGPKMELERL97f2jYWaloVVQ+NfDMufEZI0x0d7xTobBbVz5rNfkdIM0rsylg8ldli0a0KZ/z2GzruIidTF+G9q+/NMxBifL/d2L34R4SIC0ZlCduWriyp635T8Bt+POjElpM19fLu1l715m7+QYTEC0a3q5Xe4Qaz35HxrDc+mKnjRRBNX7O6Gq79BxBSriL1g9terILfkvF87ALjihJ5sS7X2uJO+OWnZHwyP5LWeuR8jxWXg5gfk7Gu/wX7uiQ4M4OKvQAAAABJRU5ErkJggg==';

/* ----------------------------- design tokens ---------------------------- */

const C = {
  bg: '#F7F9FB',
  ink: '#063C5C',
  border: '#E2EAF0',
  muted: '#6B8299',
  mutedLight: '#A8BCC8',
  critical: '#D1462F',
  success: '#31C85A',
  pending: '#6B8299',
};

/* --------------------------------- data ---------------------------------- */

const UNITS = [
  {
    id: 'ibr1', name: 'IBR1', color: '#2F6F5E',
    shifts: ['Manhã', 'Tarde'],
    sectors: ['Salão', 'Cozinha'],
  },
  {
    id: 'ibr2', name: 'IBR2', color: '#C2622E',
    shifts: ['Manhã', 'Tarde'],
    sectors: ['Salão', 'Caixa', 'Praça de Bebidas', 'Praça de Alimentos'],
  },
  {
    id: 'ibr3', name: 'IBR3', color: '#35577A',
    shifts: ['Manhã', 'Tarde'],
    sectors: ['Salão', 'Caixa', 'Praça de Bebidas', 'Praça de Alimentos'],
  },
];

/* ------------------------------ access levels ----------------------------- */

const ROLES = ['colaborador', 'lideranca', 'gerencia', 'gestao'];

const ROLE_LABELS = {
  colaborador: 'Colaborador',
  lideranca: 'Liderança',
  gerencia: 'Gerência',
  gestao: 'Diretoria',
};

const ROLE_DESCRIPTIONS = {
  colaborador: 'Executa os checklists da sua loja',
  lideranca: 'Acompanha os checklists da sua loja: feitos, pendentes e por quem',
  gerencia: 'Acesso total a checklists, setores e edição em todas as lojas',
  gestao: 'Acesso total, incluindo usuários e lojas',
};

const ROLE_COLORS = {
  colaborador: '#6B8299',
  lideranca: '#35577A',
  gerencia: '#C2622E',
  gestao: '#2F6F5E',
};

// Which bottom-nav tabs each role can see, in order.
const ROLE_TABS = {
  colaborador: ['executar', 'painel', 'id'],
  lideranca: ['executar', 'painel', 'relatorios', 'id', 'equipe'],
  gerencia: ['executar', 'painel', 'relatorios', 'gerenciar', 'equipe'],
  gestao: ['executar', 'painel', 'relatorios', 'gerenciar', 'usuarios', 'equipe'],
};

// Papéis de gestão que recebem o Daily Briefing (H1 — ver docs/REVISAO_MVP_v1.3.md §7).
const MANAGER_ROLES = ['lideranca', 'gerencia', 'gestao'];

// unitId === null means "todas as lojas" (gerência / gestão).
// SEED_USERS: PINs removed from bundle — validation happens server-side via Supabase.
// PINs are only seeded to Supabase once via saveUsers() on first run.
const SEED_USERS = [
  { id: 'u1', name: 'Michel', pin: '1234', role: 'gestao', unitId: null, sectorId: null },
  { id: 'u2', name: 'Diretoria Operacional', pin: '2222', role: 'gerencia', unitId: null, sectorId: null },
  { id: 'u5', name: 'Colaborador IBR1', pin: '1111', role: 'colaborador', unitId: 'ibr1', sectorId: null },
  { id: 'u9', name: 'Colaborador IBR2', pin: '1111', role: 'colaborador', unitId: 'ibr2', sectorId: null },
  { id: 'u13', name: 'Colaborador IBR3', pin: '1111', role: 'colaborador', unitId: 'ibr3', sectorId: null },
];

// Maps each sector name to an operational category, so generic item sets can be reused.
const SECTOR_CATEGORY = {
  'Salão': 'salao',
  'Praça de Bebidas': 'bar',
  'Praça de Alimentos': 'cozinha',
  'Cozinha': 'cozinha',
};

// The 3 default checklists every sector gets.
const CHECKLIST_TYPES = [
  { key: 'abertura', name: 'Abertura (mise en place)', shift: 'Manhã', deadline: '09:00' },
  { key: 'intermediario', name: 'Intermediário (reposições, limpeza e manutenção)', shift: ['Manhã', 'Tarde'], deadline: null },
  { key: 'fechamento', name: 'Fechamento (encerramento do dia)', shift: 'Tarde', deadline: '22:00' },
];

const ITEM_LIBRARY = {
  salao: {
    abertura: [
      { text: 'Limpar e organizar mesas, cadeiras e balcões', critical: false },
      { text: 'Repor guardanapos, talheres e cardápios', critical: false },
      { text: 'Testar máquina de café e moedor', critical: true },
      { text: 'Verificar limpeza dos banheiros', critical: true, photoRequired: true },
      { text: 'Conferir música ambiente e iluminação', critical: false },
    ],
    intermediario: [
      { text: 'Repor itens de mesa (guardanapos, molhos, talheres)', critical: false },
      { text: 'Higienizar mesas após cada uso', critical: false },
      { text: 'Conferir limpeza dos banheiros', critical: true, photoRequired: true },
      { text: 'Verificar estoque de descartáveis', critical: false },
      { text: 'Organizar área de espera e recepção', critical: false },
    ],
    fechamento: [
      { text: 'Recolher e organizar mesas e cadeiras', critical: false },
      { text: 'Varrer e passar pano no salão', critical: false },
      { text: 'Desligar equipamentos não essenciais', critical: true },
      { text: 'Conferir trancas de portas e janelas', critical: true, required: true, photoRequired: true },
      { text: 'Deixar mesas e balcões prontos para a abertura seguinte', critical: false },
    ],
  },
  caixa: {
    abertura: [
      { text: 'Contagem do fundo de caixa', critical: true, required: true, photoRequired: true },
      { text: 'Testar impressora térmica e bobina', critical: true },
      { text: 'Confirmar sistema (SAIPOS) online', critical: true },
      { text: 'Conferir troco disponível', critical: false },
    ],
    intermediario: [
      { text: 'Conferência parcial de caixa (sangria)', critical: true, photoRequired: true },
      { text: 'Verificar funcionamento da maquininha de cartão', critical: true },
      { text: 'Repor bobina da impressora se necessário', critical: false },
      { text: 'Conferir comandas abertas ou pendentes', critical: false },
    ],
    fechamento: [
      { text: 'Fechamento de caixa e conferência de valores', critical: true, required: true, photoRequired: true },
      { text: 'Emitir relatório de vendas do dia', critical: true, photoRequired: true },
      { text: 'Guardar valores em local seguro', critical: true },
      { text: 'Desligar maquininha e equipamentos', critical: false },
    ],
  },
  bar: {
    abertura: [
      { text: 'Checar temperatura de chopeira e geladeiras (°C)', critical: true, required: true, photoRequired: true },
      { text: 'Conferir estoque de bebidas e gelo', critical: false },
      { text: 'Higienizar bancada, torneiras e copos', critical: false },
      { text: 'Testar máquinas (espresso, liquidificador)', critical: false },
    ],
    intermediario: [
      { text: 'Repor gelo, bebidas e descartáveis', critical: false },
      { text: 'Higienizar bancada e utensílios', critical: false },
      { text: 'Conferir temperatura das geladeiras (°C)', critical: true, photoRequired: true },
      { text: 'Organizar garrafas e estoque visível', critical: false },
    ],
    fechamento: [
      { text: 'Limpar bancada, torneiras e máquinas', critical: false },
      { text: 'Conferir e travar geladeiras e freezers', critical: true, required: true, photoRequired: true },
      { text: 'Contar e registrar estoque de bebidas', critical: false },
      { text: 'Descartar gelo e higienizar cubas', critical: false },
    ],
  },
  cozinha: {
    abertura: [
      { text: 'Registrar temperatura das câmaras frias (°C)', critical: true, required: true, photoRequired: true },
      { text: 'Checar validade de insumos abertos no dia anterior', critical: true },
      { text: 'Montar mise en place do cardápio do dia', critical: false },
      { text: 'Higienizar bancadas, tábuas e utensílios', critical: false },
      { text: 'Conferir estoque de itens-chave', critical: false },
    ],
    intermediario: [
      { text: 'Reabastecer mise en place conforme o consumo', critical: false },
      { text: 'Higienizar bancadas e utensílios entre preparos', critical: true },
      { text: 'Conferir temperatura dos equipamentos (°C)', critical: true, photoRequired: true },
      { text: 'Organizar e repor estoque da praça', critical: false },
    ],
    fechamento: [
      { text: 'Guardar e identificar sobras com validade', critical: true, photoRequired: true },
      { text: 'Limpeza profunda de bancadas, chapas e fogões', critical: false },
      { text: 'Checar e desligar equipamentos', critical: true },
      { text: 'Conferir fechamento de câmaras e freezers', critical: true, required: true, photoRequired: true },
      { text: 'Repor itens para a abertura do dia seguinte', critical: false },
    ],
  },
};

/* -------------------------------- helpers -------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 10);

const IBR2_TEMPLATES = [
  {
    id: 'te555f8d0', unitId: 'ibr2', sector: "Salão", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Limpar e organizar as mesas, cadeiras e balcão" },
      { id: 'i2', text: "Limpar o chão do salão" },
      { id: 'i3', text: "Colocar as mesas e cadeiras da área externa no corredor" },
      { id: 'i4', text: "Limpar os trilhos das janelas na área das mesas externas" },
      { id: 'i5', text: "Varrer o chão da área externa" },
      { id: 'i6', text: "Limpar e organizar o porta-guarda-chuvas" },
      { id: 'i7', text: "Destrancar as portas e virar as placas para Open (8:00)", critical: true },
      { id: 'i8', text: "Reabastecer galheteiros" },
    ],
  },
  {
    id: 't04102c97', unitId: 'ibr2', sector: "Salão", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Limpeza de vidros" },
      { id: 'i2', text: "Aguar as plantas" },
      { id: 'i3', text: "Limpar e reorganizar a lojinha", recurrence: [1,3] },
      { id: 'i4', text: "Checar e trocar QR codes das mesas, se necessário", recurrence: [2,4] },
      { id: 'i5', text: "Higienizar canecas de centro de mesa", recurrence: [2,4] },
      { id: 'i6', text: "Limpar trilhos das janelas", recurrence: [4] },
      { id: 'i7', text: "Lavar lixeiras", recurrence: [3] },
      { id: 'i8', text: "Lavar bandejas" },
      { id: 'i9', text: "Abastecer na ilha louças, tábuas e papéis antigordura" },
      { id: 'i10', text: "Limpar e abastecer talheres ensacados" },
    ],
  },
  {
    id: 't1b20769a', unitId: 'ibr2', sector: "Salão", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Limpar mesas e cadeiras" },
      { id: 'i2', text: "Subir as cadeiras" },
      { id: 'i3', text: "Varrer e passar pano no chão" },
      { id: 'i4', text: "Descer as cadeiras" },
      { id: 'i5', text: "Guardar mesas e cadeiras externas" },
      { id: 'i6', text: "Verificar se as janelas estão fechadas", critical: true },
      { id: 'i7', text: "Trancar a porta de acesso aos banheiros", critical: true },
      { id: 'i8', text: "Trancar as portas da frente com cadeados", critical: true, required: true, photoRequired: true },
    ],
  },
  {
    id: 't1988f366', unitId: 'ibr2', sector: "Caixa", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Desligar o alarme", critical: true },
      { id: 'i2', text: "Guardar os cadeados das portas embaixo do caixa" },
      { id: 'i3', text: "Ligar o computador" },
      { id: 'i4', text: "Ligar a impressora térmica" },
      { id: 'i5', text: "Checar se as máquinas de cartão estão carregadas", critical: true },
      { id: 'i6', text: "Acender as luzes" },
      { id: 'i7', text: "Ligar o ar condicionado, quando necessário" },
      { id: 'i8', text: "Ligar o Spotify na playlist oficial IBR" },
      { id: 'i9', text: "Contar o dinheiro da gaveta do caixa", critical: true, required: true, photoRequired: true },
      { id: 'i10', text: "Abrir o caixa / sistema", critical: true, required: true, photoRequired: true },
      { id: 'i11', text: "Abrir o sistema de clube de vantagens" },
      { id: 'i12', text: "Abrir o WhatsApp da loja" },
      { id: 'i13', text: "Abastecer os pães de mandioquinha inteiros para venda na vitrine" },
      { id: 'i14', text: "Abastecer cookies para venda" },
    ],
  },
  {
    id: 't7fc87129', unitId: 'ibr2', sector: "Caixa", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Enviar pedido de mercado no grupo WhatsApp (para compra no dia seguinte)", recurrence: [1,3,5] },
      { id: 'i2', text: "Enviar foto da NF de compra de mercado", recurrence: [2,4,6] },
      { id: 'i3', text: "Organização e limpeza das prateleiras do caixa", recurrence: [5] },
      { id: 'i4', text: "Contagem semanal de estoque", recurrence: [6] },
      { id: 'i5', text: "Enviar foto da planilha de pedidos preenchida", recurrence: [2,4] },
    ],
  },
  {
    id: 'td4f05b74', unitId: 'ibr2', sector: "Caixa", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Contar o dinheiro da gaveta do caixa", critical: true, required: true, photoRequired: true },
      { id: 'i2', text: "Fechar o caixa", critical: true, required: true, photoRequired: true },
      { id: 'i3', text: "Desligar o som" },
      { id: 'i4', text: "Desligar a TV" },
      { id: 'i5', text: "Desligar o computador" },
      { id: 'i6', text: "Checar se as máquinas de cartão estão carregando", critical: true },
      { id: 'i7', text: "Desligar a impressora" },
      { id: 'i8', text: "Desligar o ar condicionado operacional" },
      { id: 'i9', text: "Desligar o ar condicionado da lojinha" },
      { id: 'i10', text: "Desligar o ar condicionado do salão" },
    ],
  },
  {
    id: 't12f6c396', unitId: 'ibr2', sector: "Praça de Bebidas", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Conferir a máquina de espresso ligada e com pressão", critical: true },
      { id: 'i2', text: "Regular o moinho / café espresso" },
      { id: 'i3', text: "Verificar o moinho de filtrados e coados" },
      { id: 'i4', text: "Verificar o blender (liquidificador)" },
      { id: 'i5', text: "Verificar o mixer" },
      { id: 'i6', text: "Abastecer copos e xícaras em cima da máquina de espresso" },
      { id: 'i7', text: "Conferir métodos e filtros de cafés" },
      { id: 'i8', text: "Conferir os utensílios da praça de bebidas, limpos e em estado de uso (montagem de praça)", required: true, photoRequired: true },
      { id: 'i9', text: "Repor águas, refrigerantes, leites e caldas" },
      { id: 'i10', text: "Checar qualidade do chantilly e preparar mais se necessário" },
      { id: 'i11', text: "Abastecer potes de insumos do bar" },
    ],
  },
  {
    id: 'tb0de97e5', unitId: 'ibr2', sector: "Praça de Bebidas", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Limpeza do moinho de cafés coados", recurrence: [2,4] },
      { id: 'i2', text: "Descongelamento e limpeza do freezer da praça de bebidas", recurrence: [4] },
      { id: 'i3', text: "Limpeza dos difusores da máquina de espresso", recurrence: [1,3,5] },
      { id: 'i4', text: "Limpeza dos porta-filtros da máquina de espresso", recurrence: [1,3,5] },
      { id: 'i5', text: "Organização e limpeza de armários e prateleiras da praça de bebidas", recurrence: [5] },
      { id: 'i6', text: "Organização de insumos e checagem de validades — primeiro que entra, primeiro que sai", recurrence: [5] },
      { id: 'i7', text: "Verificar se as embalagens para viagem estão abastecidas" },
    ],
  },
  {
    id: 't15df1f1b', unitId: 'ibr2', sector: "Praça de Bebidas", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Limpar a máquina de espresso e desligar", critical: true },
      { id: 'i2', text: "Colocar os porta-filtros no lugar" },
      { id: 'i3', text: "Desligar os moinhos" },
      { id: 'i4', text: "Desligar e limpar liquidificadores e blenders" },
      { id: 'i5', text: "Desligar e limpar o mixer" },
      { id: 'i6', text: "Reabastecer xícaras e pires sobre a máquina" },
      { id: 'i7', text: "Recolocar os utensílios de bar" },
      { id: 'i8', text: "Esvaziar e limpar a gaveta de borras" },
      { id: 'i9', text: "Limpar as bancadas" },
      { id: 'i10', text: "Varrer e lavar o chão" },
    ],
  },
  {
    id: 'tb42a5333', unitId: 'ibr2', sector: "Praça de Alimentos", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Ligar a máquina de lavar louças" },
      { id: 'i2', text: "Verificar a sanduicheira" },
      { id: 'i3', text: "Verificar o fogão" },
      { id: 'i4', text: "Aquecer água com vinagre e sal para ovo poché" },
      { id: 'i5', text: "Conferir os utensílios da praça de alimentos, limpos e em estado de uso (montagem de praça)", required: true, photoRequired: true },
      { id: 'i6', text: "Verificar máquinas de waffle limpas e funcionando" },
      { id: 'i7', text: "Checar etiquetas de validade", critical: true },
      { id: 'i8', text: "Limpar, abastecer e organizar a vitrine" },
      { id: 'i9', text: "Higienizar balcões e ilhas com álcool 70" },
      { id: 'i10', text: "Preparar e abastecer massas de waffle (tradicional e parmesão)" },
      { id: 'i11', text: "Abastecer na ilha louças, tábuas e papéis antigordura" },
      { id: 'i12', text: "Higienizar, ensacar e reabastecer talheres" },
    ],
  },
  {
    id: 'tf9e64754', unitId: 'ibr2', sector: "Praça de Alimentos", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Repor base de ovos: bater, etiquetar e guardar" },
      { id: 'i2', text: "Repor pães fatiados nas caixas de serviço: Levain, Mandioquinha e Leite" },
      { id: 'i3', text: "Checar itens a descongelar na geladeira para o dia seguinte: molhos, cremes e frios" },
      { id: 'i4', text: "Repor manga de Nutella, se necessário" },
      { id: 'i5', text: "Checar qualidade das frutas e realizar porcionamentos, se necessário" },
      { id: 'i6', text: "Checar necessidade de reposições conforme estoques mínimos e lançar na planilha de pedidos", critical: true },
      { id: 'i7', text: "Repor mamão fatiado na caixa de serviço" },
      { id: 'i8', text: "Repor manga cortada pela metade, com corte quadriculado, sem retirar da casca" },
      { id: 'i9', text: "Limpeza da coifa / depurador", recurrence: [1] },
      { id: 'i10', text: "Limpeza de geladeiras", recurrence: [1,3] },
      { id: 'i11', text: "Limpeza de forno", recurrence: [1,3] },
      { id: 'i12', text: "Limpeza de micro-ondas", recurrence: [1,3] },
      { id: 'i13', text: "Limpeza de prateleiras da praça de alimentos", recurrence: [1,3,5] },
      { id: 'i14', text: "Descongelamento e limpeza do freezer da praça de alimentos", recurrence: [5] },
      { id: 'i15', text: "Organização de insumos e checagem de validades — primeiro que entra, primeiro que sai", recurrence: [5] },
      { id: 'i16', text: "Limpar a vitrine", recurrence: [6] },
      { id: 'i17', text: "Verificar se as embalagens para viagem estão abastecidas" },
      { id: 'i18', text: "Preparar e abastecer massas de waffle (tradicional e parmesão)", recurrence: [1,3] },
      { id: 'i19', text: "Cortar e abastecer pães" },
    ],
  },
  {
    id: 't0f6daec1', unitId: 'ibr2', sector: "Praça de Alimentos", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Finalizar a lavagem de louças" },
      { id: 'i2', text: "Higienizar e ensacar talheres" },
      { id: 'i3', text: "Desligar o forno" },
      { id: 'i4', text: "Desligar o fogão" },
      { id: 'i5', text: "Desligar e limpar as máquinas de waffle" },
      { id: 'i6', text: "Desligar e limpar a sanduicheira" },
      { id: 'i7', text: "Lavar e organizar as assadeiras" },
      { id: 'i8', text: "Limpar a vitrine e desligar a luz" },
      { id: 'i9', text: "Limpar e higienizar o balcão e a ilha" },
      { id: 'i10', text: "Guardar insumos da bancada" },
      { id: 'i11', text: "Desligar e limpar a máquina de lavar louças" },
      { id: 'i12', text: "Retirar os lixos e recolocar sacos" },
      { id: 'i13', text: "Limpar a pia e retirar o lixo do ralinho" },
      { id: 'i14', text: "Limpar as bancadas" },
      { id: 'i15', text: "Varrer e lavar o chão" },
    ],
  },
];



const IBR3_TEMPLATES = [
  {
    id: 'te153fed3', unitId: 'ibr3', sector: "Salão", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Limpar e organizar as mesas, cadeiras e balcão" },
      { id: 'i2', text: "Limpar o chão do salão" },
      { id: 'i3', text: "Colocar as mesas e cadeiras da área externa no corredor" },
      { id: 'i4', text: "Limpar os trilhos das janelas na área das mesas externas" },
      { id: 'i5', text: "Varrer o chão da área externa" },
      { id: 'i6', text: "Limpar e organizar o porta-guarda-chuvas" },
      { id: 'i7', text: "Destrancar as portas e virar as placas para Open (8:00)", critical: true },
      { id: 'i8', text: "Reabastecer galheteiros" },
    ],
  },
  {
    id: 't76509ef0', unitId: 'ibr3', sector: "Salão", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Limpeza de vidros" },
      { id: 'i2', text: "Aguar as plantas" },
      { id: 'i3', text: "Limpar e reorganizar a lojinha", recurrence: [1,3] },
      { id: 'i4', text: "Checar e trocar QR codes das mesas, se necessário", recurrence: [2,4] },
      { id: 'i5', text: "Higienizar canecas de centro de mesa", recurrence: [2,4] },
      { id: 'i6', text: "Limpar trilhos das janelas", recurrence: [4] },
      { id: 'i7', text: "Lavar lixeiras", recurrence: [3] },
      { id: 'i8', text: "Lavar bandejas" },
      { id: 'i9', text: "Abastecer na ilha louças, tábuas e papéis antigordura" },
      { id: 'i10', text: "Limpar e abastecer talheres ensacados" },
    ],
  },
  {
    id: 'tbcb90cef', unitId: 'ibr3', sector: "Salão", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Limpar mesas e cadeiras" },
      { id: 'i2', text: "Subir as cadeiras" },
      { id: 'i3', text: "Varrer e passar pano no chão" },
      { id: 'i4', text: "Descer as cadeiras" },
      { id: 'i5', text: "Guardar mesas e cadeiras externas" },
      { id: 'i6', text: "Verificar se as janelas estão fechadas", critical: true },
      { id: 'i7', text: "Trancar a porta de acesso aos banheiros", critical: true },
      { id: 'i8', text: "Trancar as portas da frente com cadeados", critical: true, required: true, photoRequired: true },
    ],
  },
  {
    id: 't31de08e5', unitId: 'ibr3', sector: "Caixa", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Desligar o alarme", critical: true },
      { id: 'i2', text: "Guardar os cadeados das portas embaixo do caixa" },
      { id: 'i3', text: "Ligar o computador" },
      { id: 'i4', text: "Ligar a impressora térmica" },
      { id: 'i5', text: "Checar se as máquinas de cartão estão carregadas", critical: true },
      { id: 'i6', text: "Acender as luzes" },
      { id: 'i7', text: "Ligar o ar condicionado, quando necessário" },
      { id: 'i8', text: "Ligar o Spotify na playlist oficial IBR" },
      { id: 'i9', text: "Contar o dinheiro da gaveta do caixa", critical: true, required: true, photoRequired: true },
      { id: 'i10', text: "Abrir o caixa / sistema", critical: true, required: true, photoRequired: true },
      { id: 'i11', text: "Abrir o sistema de clube de vantagens" },
      { id: 'i12', text: "Abrir o WhatsApp da loja" },
      { id: 'i13', text: "Abastecer os pães de mandioquinha inteiros para venda na vitrine" },
      { id: 'i14', text: "Abastecer cookies para venda" },
    ],
  },
  {
    id: 'ta6e35b25', unitId: 'ibr3', sector: "Caixa", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Enviar pedido de mercado no grupo WhatsApp (para compra no dia seguinte)", recurrence: [1,3,5] },
      { id: 'i2', text: "Enviar foto da NF de compra de mercado", recurrence: [2,4,6] },
      { id: 'i3', text: "Organização e limpeza das prateleiras do caixa", recurrence: [5] },
      { id: 'i4', text: "Contagem semanal de estoque", recurrence: [6] },
      { id: 'i5', text: "Enviar foto da planilha de pedidos preenchida", recurrence: [2,4] },
    ],
  },
  {
    id: 't431af6da', unitId: 'ibr3', sector: "Caixa", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Contar o dinheiro da gaveta do caixa", critical: true, required: true, photoRequired: true },
      { id: 'i2', text: "Fechar o caixa", critical: true, required: true, photoRequired: true },
      { id: 'i3', text: "Desligar o som" },
      { id: 'i4', text: "Desligar a TV" },
      { id: 'i5', text: "Desligar o computador" },
      { id: 'i6', text: "Checar se as máquinas de cartão estão carregando", critical: true },
      { id: 'i7', text: "Desligar a impressora" },
      { id: 'i8', text: "Desligar o ar condicionado operacional" },
      { id: 'i9', text: "Desligar o ar condicionado da lojinha" },
      { id: 'i10', text: "Desligar o ar condicionado do salão" },
    ],
  },
  {
    id: 'tba58145d', unitId: 'ibr3', sector: "Praça de Bebidas", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Conferir a máquina de espresso ligada e com pressão", critical: true },
      { id: 'i2', text: "Regular o moinho / café espresso" },
      { id: 'i3', text: "Verificar o moinho de filtrados e coados" },
      { id: 'i4', text: "Verificar o blender (liquidificador)" },
      { id: 'i5', text: "Verificar o mixer" },
      { id: 'i6', text: "Abastecer copos e xícaras em cima da máquina de espresso" },
      { id: 'i7', text: "Conferir métodos e filtros de cafés" },
      { id: 'i8', text: "Conferir os utensílios da praça de bebidas, limpos e em estado de uso (montagem de praça)", required: true, photoRequired: true },
      { id: 'i9', text: "Repor águas, refrigerantes, leites e caldas" },
      { id: 'i10', text: "Checar qualidade do chantilly e preparar mais se necessário" },
      { id: 'i11', text: "Abastecer potes de insumos do bar" },
    ],
  },
  {
    id: 't91b88f40', unitId: 'ibr3', sector: "Praça de Bebidas", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Limpeza do moinho de cafés coados", recurrence: [2,4] },
      { id: 'i2', text: "Descongelamento e limpeza do freezer da praça de bebidas", recurrence: [4] },
      { id: 'i3', text: "Limpeza dos difusores da máquina de espresso", recurrence: [1,3,5] },
      { id: 'i4', text: "Limpeza dos porta-filtros da máquina de espresso", recurrence: [1,3,5] },
      { id: 'i5', text: "Organização e limpeza de armários e prateleiras da praça de bebidas", recurrence: [5] },
      { id: 'i6', text: "Organização de insumos e checagem de validades — primeiro que entra, primeiro que sai", recurrence: [5] },
      { id: 'i7', text: "Verificar se as embalagens para viagem estão abastecidas" },
    ],
  },
  {
    id: 'tcc03b13b', unitId: 'ibr3', sector: "Praça de Bebidas", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Limpar a máquina de espresso e desligar", critical: true },
      { id: 'i2', text: "Colocar os porta-filtros no lugar" },
      { id: 'i3', text: "Desligar os moinhos" },
      { id: 'i4', text: "Desligar e limpar liquidificadores e blenders" },
      { id: 'i5', text: "Desligar e limpar o mixer" },
      { id: 'i6', text: "Reabastecer xícaras e pires sobre a máquina" },
      { id: 'i7', text: "Recolocar os utensílios de bar" },
      { id: 'i8', text: "Esvaziar e limpar a gaveta de borras" },
      { id: 'i9', text: "Limpar as bancadas" },
      { id: 'i10', text: "Varrer e lavar o chão" },
    ],
  },
  {
    id: 't884d369a', unitId: 'ibr3', sector: "Praça de Alimentos", shift: "Manhã",
    name: "Abertura (mise en place)", deadline: "09:00",
    items: [
      { id: 'i1', text: "Ligar a máquina de lavar louças" },
      { id: 'i2', text: "Verificar a sanduicheira" },
      { id: 'i3', text: "Verificar o fogão" },
      { id: 'i4', text: "Aquecer água com vinagre e sal para ovo poché" },
      { id: 'i5', text: "Conferir os utensílios da praça de alimentos, limpos e em estado de uso (montagem de praça)", required: true, photoRequired: true },
      { id: 'i6', text: "Verificar máquinas de waffle limpas e funcionando" },
      { id: 'i7', text: "Checar etiquetas de validade", critical: true },
      { id: 'i8', text: "Limpar, abastecer e organizar a vitrine" },
      { id: 'i9', text: "Higienizar balcões e ilhas com álcool 70" },
      { id: 'i10', text: "Preparar e abastecer massas de waffle (tradicional e parmesão)" },
      { id: 'i11', text: "Abastecer na ilha louças, tábuas e papéis antigordura" },
      { id: 'i12', text: "Higienizar, ensacar e reabastecer talheres" },
    ],
  },
  {
    id: 't16584e68', unitId: 'ibr3', sector: "Praça de Alimentos", shift: ["Manhã", "Tarde"],
    name: "Intermediário (reposições, limpeza e manutenção)", deadline: null,
    items: [
      { id: 'i1', text: "Repor base de ovos: bater, etiquetar e guardar" },
      { id: 'i2', text: "Repor pães fatiados nas caixas de serviço: Levain, Mandioquinha e Leite" },
      { id: 'i3', text: "Checar itens a descongelar na geladeira para o dia seguinte: molhos, cremes e frios" },
      { id: 'i4', text: "Repor manga de Nutella, se necessário" },
      { id: 'i5', text: "Checar qualidade das frutas e realizar porcionamentos, se necessário" },
      { id: 'i6', text: "Checar necessidade de reposições conforme estoques mínimos e lançar na planilha de pedidos", critical: true },
      { id: 'i7', text: "Repor mamão fatiado na caixa de serviço" },
      { id: 'i8', text: "Repor manga cortada pela metade, com corte quadriculado, sem retirar da casca" },
      { id: 'i9', text: "Limpeza da coifa / depurador", recurrence: [1] },
      { id: 'i10', text: "Limpeza de geladeiras", recurrence: [1,3] },
      { id: 'i11', text: "Limpeza de forno", recurrence: [1,3] },
      { id: 'i12', text: "Limpeza de micro-ondas", recurrence: [1,3] },
      { id: 'i13', text: "Limpeza de prateleiras da praça de alimentos", recurrence: [1,3,5] },
      { id: 'i14', text: "Descongelamento e limpeza do freezer da praça de alimentos", recurrence: [5] },
      { id: 'i15', text: "Organização de insumos e checagem de validades — primeiro que entra, primeiro que sai", recurrence: [5] },
      { id: 'i16', text: "Limpar a vitrine", recurrence: [6] },
      { id: 'i17', text: "Verificar se as embalagens para viagem estão abastecidas" },
      { id: 'i18', text: "Preparar e abastecer massas de waffle (tradicional e parmesão)", recurrence: [1,3] },
      { id: 'i19', text: "Cortar e abastecer pães" },
    ],
  },
  {
    id: 'tbc72a748', unitId: 'ibr3', sector: "Praça de Alimentos", shift: "Tarde",
    name: "Fechamento (encerramento do dia)", deadline: "18:00",
    items: [
      { id: 'i1', text: "Finalizar a lavagem de louças" },
      { id: 'i2', text: "Higienizar e ensacar talheres" },
      { id: 'i3', text: "Desligar o forno" },
      { id: 'i4', text: "Desligar o fogão" },
      { id: 'i5', text: "Desligar e limpar as máquinas de waffle" },
      { id: 'i6', text: "Desligar e limpar a sanduicheira" },
      { id: 'i7', text: "Lavar e organizar as assadeiras" },
      { id: 'i8', text: "Limpar a vitrine e desligar a luz" },
      { id: 'i9', text: "Limpar e higienizar o balcão e a ilha" },
      { id: 'i10', text: "Guardar insumos da bancada" },
      { id: 'i11', text: "Desligar e limpar a máquina de lavar louças" },
      { id: 'i12', text: "Retirar os lixos e recolocar sacos" },
      { id: 'i13', text: "Limpar a pia e retirar o lixo do ralinho" },
      { id: 'i14', text: "Limpar as bancadas" },
      { id: 'i15', text: "Varrer e lavar o chão" },
    ],
  },
];


function generateSeedTemplates() {
  const templates = [];
  UNITS.forEach(u => {
    if (u.id === 'ibr2' || u.id === 'ibr3') return; // IBR2 and IBR3 use real checklists defined below.
    u.sectors.forEach(sector => {
      const category = SECTOR_CATEGORY[sector];
      CHECKLIST_TYPES.forEach(ct => {
        templates.push({
          id: 't' + (u.id + sector + ct.name).split('').reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0).toString(16).replace('-','').slice(0,8),
          unitId: u.id,
          sector,
          shift: ct.shift,
          name: ct.name,
          deadline: ct.deadline,
          items: ITEM_LIBRARY[category][ct.key].map((item, idx) => ({
            id: `i${idx + 1}`,
            text: item.text,
            critical: !!item.critical,
            required: !!item.required,
            photoRequired: !!item.photoRequired,
          })),
        });
      });
    });
  });
  templates.push(...IBR2_TEMPLATES);
  templates.push(...IBR3_TEMPLATES);
  return templates;
}

const SEED_TEMPLATES = generateSeedTemplates();

const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
const truncName = (name, max = 22) => name && name.length > max ? name.slice(0, max).trim() + '…' : name;

// A template's shift can be a single shift or an array (e.g. Intermediário runs in both).
const matchesShift = (t, shift) => Array.isArray(t.shift) ? t.shift.includes(shift) : t.shift === shift;
const shiftLabel = t => Array.isArray(t.shift) ? t.shift.join(' e ') : t.shift;

// Returns true if the given unit is marked as closed on the given date.
const isUnitClosed = (closures, unitId, dateStr) =>
  closures.some(c => c.unitId === unitId && c.date === dateStr);

// Recurrence: undefined/null/empty = every day. Otherwise an array of weekday numbers (0=Dom ... 6=Sáb).
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const isItemApplicable = (item, dateStr, templateType) => {
  // If item has explicit appearsIn, check it matches the template type
  if (item.appearsIn && item.appearsIn.length > 0) {
    if (templateType && !item.appearsIn.includes(templateType)) return false;
  }
  // Check recurrence
  if (!item.recurrence || item.recurrence.length === 0) return true;
  const weekday = new Date(`${dateStr}T00:00:00`).getDay();
  return item.recurrence.includes(weekday);
};
const applicableItems = (template, dateStr) => {
  // Detect template type from name
  const n = (template.name || '').toLowerCase();
  const templateType = n.includes('abertura') ? 'abertura' : n.includes('fechamento') ? 'fechamento' : n.includes('intermedi') ? 'intermediario' : null;
  return template.items.filter(i => isItemApplicable(i, dateStr, templateType));
};

/* ------------------------------ report helpers ----------------------------- */

const PERIODS = [
  { id: 'today', label: 'Hoje', days: 1 },
  { id: '7d', label: '7 dias', days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: 'month', label: 'Mês', days: null },
  { id: 'all', label: 'Tudo', days: null },
  { id: 'custom', label: 'Personalizado', days: null },
];

// Returns the list of YYYY-MM-DD strings covered by a period (null for "all" / incomplete "custom").
function periodDates(periodId, from, to, selectedMonth) {
  if (periodId === 'custom') {
    if (!from || !to || from > to) return null;
    const out = [];
    let d = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    while (d <= end) {
      out.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }
  if (periodId === 'month') {
    const [y, m] = (selectedMonth || todayStr().slice(0, 7)).split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = todayStr();
    const out = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = `${y}-${String(m).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
      if (d <= today) out.push(d);
    }
    return out.length > 0 ? out : null;
  }
  const period = PERIODS.find(p => p.id === periodId);
  if (!period || period.days == null) return null;
  const out = [];
  const now = new Date();
  for (let i = 0; i < period.days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function filterCompletions(completions, f) {
  return completions.filter(c => {
    if (f.dates && !f.dates.includes(c.date)) return false;
    if (f.unitId && c.unitId !== f.unitId) return false;
    if (f.sectorList && !f.sectorList.includes(c.sector)) return false;
    else if (f.sector && c.sector !== f.sector) return false;
    if (f.shift && !(c.shift || '').includes(f.shift)) return false;
    if (f.userId && c.operatorUserId !== f.userId && c.operatorName !== f.userId) return false;
    return true;
  });
}

// Number of checklists expected on a given date, considering each template's item-level recurrence:
// a template counts as "expected" that day if at least one of its items applies to that weekday.
function countApplicableTemplatesOnDate(templates, f, dateStr) {
  return templates.filter(t => {
    if (f.unitId && t.unitId !== f.unitId) return false;
    if (f.sector && t.sector !== f.sector) return false;
    if (f.shift && !matchesShift(t, f.shift)) return false;
    return t.items.some(i => isItemApplicable(i, dateStr));
  }).length;
}

function summarizeCompletions(filtered) {
  let totalItems = 0, doneItems = 0, criticalPending = 0, photos = 0;
  filtered.forEach(c => {
    totalItems += c.items.length;
    c.items.forEach(i => {
      if (i.done) doneItems += 1;
      if (i.critical && !i.done) criticalPending += 1;
      if (i.hasPhoto) photos += 1;
    });
  });
  return {
    checklists: filtered.length,
    totalItems, doneItems,
    rate: totalItems ? (doneItems / totalItems) * 100 : 0,
    criticalPending, photos,
  };
}

// "Nível de realização das tarefas" por colaborador: % de itens concluídos do total executado por essa pessoa.
function collaboratorStats(filtered) {
  const map = new Map();
  filtered.forEach(c => {
    const key = c.operatorUserId || c.operatorName || '—';
    if (!map.has(key)) map.set(key, { key, name: c.operatorName || 'Sem responsável', checklists: 0, totalItems: 0, doneItems: 0, criticalPending: 0, photos: 0, last: c.completedAt });
    const s = map.get(key);
    s.checklists += 1;
    s.totalItems += c.items.length;
    c.items.forEach(i => {
      if (i.done) s.doneItems += 1;
      if (i.critical && !i.done) s.criticalPending += 1;
      if (i.hasPhoto) s.photos += 1;
    });
    if (c.completedAt > s.last) s.last = c.completedAt;
  });
  return [...map.values()]
    .map(s => ({ ...s, rate: s.totalItems ? (s.doneItems / s.totalItems) * 100 : 0 }))
    .sort((a, b) => b.rate - a.rate || b.checklists - a.checklists);
}

// Agrupa por loja, setor ou turno.
function groupStats(filtered, groupBy) {
  const map = new Map();
  filtered.forEach(c => {
    let key;
    if (groupBy === 'loja') key = UNITS.find(u => u.id === c.unitId)?.name || c.unitId;
    else if (groupBy === 'setor') key = c.sector;
    else if (groupBy === 'tipo') {
      const ct = CHECKLIST_TYPE_ORDER.find(ct => ct.match({ name: c.templateName }));
      key = ct ? ct.label : c.templateName;
    }
    else key = c.shift || '—';
    if (!map.has(key)) map.set(key, { key, checklists: 0, totalItems: 0, doneItems: 0, criticalPending: 0 });
    const s = map.get(key);
    s.checklists += 1;
    s.totalItems += c.items.length;
    c.items.forEach(i => {
      if (i.done) s.doneItems += 1;
      if (i.critical && !i.done) s.criticalPending += 1;
    });
  });
  return [...map.values()]
    .map(s => ({ ...s, rate: s.totalItems ? (s.doneItems / s.totalItems) * 100 : 0 }))
    .sort((a, b) => b.checklists - a.checklists);
}

// Generates ~7 days of realistic-looking completion history (for testing the Relatórios tab).
function generateSimulatedCompletions(templates, users, days = 7) {
  const completions = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    const dateStr = d.toISOString().slice(0, 10);
    const weekday = d.getDay();

    templates.forEach(t => {
      const items = t.items.filter(i => isItemApplicable(i, dateStr));
      if (items.length === 0) return;

      const shiftNames = Array.isArray(t.shift) ? t.shift : [t.shift];
      const shiftName = shiftNames[offset % shiftNames.length];
      const candidates = users.filter(u => u.unitId === t.unitId && u.role === 'colaborador' && u.name.includes(shiftName));
      const operator = candidates.length
        ? candidates[(offset + t.id.length) % candidates.length]
        : (users.find(u => u.unitId === t.unitId && u.role === 'colaborador') || users[0]);

      const recordItems = items.map(i => {
        const p = i.critical ? 0.92 : 0.85;
        const done = Math.random() < p;
        return { id: i.id, critical: !!i.critical, required: !!i.required, done, note: '', hasPhoto: !!i.photoRequired && done };
      });

      const baseHour = shiftName === 'Manhã' ? 8.5 : shiftName === 'Tarde' ? 17.5 : 14;
      const completedAt = new Date(d);
      completedAt.setHours(Math.floor(baseHour + Math.random() * 1.5), Math.floor(Math.random() * 60), 0, 0);

      completions.push({
        id: uid(), templateId: t.id, templateName: t.name, unitId: t.unitId, sector: t.sector,
        shift: shiftLabel(t), date: dateStr, completedAt: completedAt.toISOString(),
        operatorName: operator.name, operatorUserId: operator.id, items: recordItems,
      });
    });
  }
  return completions;
}

// Resizes and compresses an image file to a small JPEG data URL for proof-of-task photos.
function compressImage(file, maxDim = 640, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function templateStatus(t, completions, today) {
  const done = completions.some(c => c.templateId === t.id && c.date === today);
  if (done) return 'done';
  if (t.deadline) {
    const [h, m] = t.deadline.split(':').map(Number);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() > h * 60 + m) return 'overdue';
  }
  return 'pending';
}

const STATUS_CFG = {
  done: { label: 'Concluído', color: C.success },
  overdue: { label: 'Atrasado', color: C.critical },
  pending: { label: 'Pendente', color: C.pending },
};

/* ------------------------------ small atoms ------------------------------ */

function Eyebrow({ children }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted }}>
      {children}
    </p>
  );
}

function Ticket({ accent, children, style, ...rest }) {
  return (
    <div {...rest} style={{ display: 'flex', background: 'white', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden', ...style }}>
      <div
        style={{
          width: 10, flexShrink: 0, background: accent,
          backgroundImage: `radial-gradient(circle, ${C.bg} 2.5px, transparent 2.5px)`,
          backgroundSize: '100% 14px', backgroundPosition: 'center top',
        }}
      />
      <div style={{ flex: 1, padding: 12, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status];
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
        padding: '4px 8px', borderRadius: 4, background: `${cfg.color}1A`, color: cfg.color, whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}

function BackBar({ onBack, label, accent, motiv }) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3">
      <button
        onClick={onBack}
        className="flex items-center gap-2"
        style={{
          background: 'white',
          border: `1.5px solid ${C.border}`,
          borderRadius: 8,
          padding: '10px 16px',
          fontWeight: 800,
          fontSize: 14,
          color: C.ink,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <ArrowLeft size={18} color={accent} />
        <span>{label}</span>
      </button>
      {motiv && (
        <p style={{ fontSize: 12, fontWeight: 700, color: accent, textAlign: 'right', lineHeight: 1.3 }}>{motiv}</p>
      )}
    </div>
  );
}

function EmptyState({ title, desc }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', border: `1px dashed ${C.border}`, borderRadius: 6 }}>
      <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{title}</p>
      <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{desc}</p>
    </div>
  );
}

function PillButton({ active, accent, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5"
      style={{
        borderRadius: 6, fontSize: 13, fontWeight: 800, border: `1.5px solid ${active ? accent : C.border}`,
        background: active ? accent : 'white', color: active ? C.bg : C.muted,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------ item row ---------------------------------- */

function ItemRow({ item, state, accent, locked, onToggle, onNote, onPhoto, liveInfo, onReopen, currentUserId }) {
  const fileInputRef = useRef(null);
  const [showDesc, setShowDesc] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState(null);
  // Estado colaborativo: item concluído no estado compartilhado (por mim ou por colega).
  const collabDone = !!liveInfo?.done;
  const byOther = collabDone && liveInfo.operatorUserId && liveInfo.operatorUserId !== currentUserId;
  const effDone = state.done || collabDone;
  const lineColor = locked ? C.mutedLight : effDone ? C.success : item.critical ? C.critical : accent;
  const needsPhoto = item.photoRequired && !state.photo;

  return (
    <>
      <Ticket accent={lineColor}>
      <div className="flex items-start gap-3" style={{ opacity: locked ? 0.5 : byOther ? 0.6 : 1 }}>
        <button
          onClick={onToggle}
          disabled={locked}
          style={{ background: 'none', border: 'none', padding: 0, marginTop: 1, flexShrink: 0, cursor: locked ? 'not-allowed' : 'pointer' }}
        >
          {effDone
            ? <CheckCircle2 size={24} color={C.success} />
            : <Circle size={24} color={C.mutedLight} />}
        </button>
        <div className="flex-1" style={{ minWidth: 0 }}>
          <div className="flex items-start justify-between gap-2">
            <p style={{ fontSize: 14, fontWeight: 500, color: effDone ? C.muted : C.ink, textDecoration: effDone ? 'line-through' : 'none', flex: 1 }}>
              {item.text}
            </p>
            {(item.description || (item.refPhotos?.length > 0) || item.refLink) && (
              <button
                onClick={() => setShowDesc(v => !v)}
                style={{ fontSize: 11, fontWeight: 800, color: accent, background: 'none', border: `1px solid ${accent}`, borderRadius: 20, padding: '2px 10px', flexShrink: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {showDesc ? 'Ver menos' : 'Ver mais'}
              </button>
            )}
          </div>

          {showDesc && (item.description || (item.refPhotos?.length > 0) || item.refLink) && (
            <div style={{ marginTop: 8, padding: '10px 12px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
              {item.description && (
                <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: (item.refPhotos?.length > 0 || item.refLink) ? 10 : 0 }}>{item.description}</p>
              )}
              {item.refPhotos?.length > 0 && (
                <div style={{ marginBottom: item.refLink ? 10 : 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Referências</p>
                  <div className="flex flex-wrap gap-2">
                    {item.refPhotos.map((photo, pi) => (
                      <img key={pi} src={photo} alt={`ref ${pi+1}`}
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}`, cursor: 'pointer' }}
                        onClick={() => setExpandedPhoto(photo)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {item.refLink && (
                <a href={item.refLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2"
                  style={{ fontSize: 13, fontWeight: 700, color: accent, textDecoration: 'none', padding: '8px 12px', background: `${accent}12`, borderRadius: 8, border: `1px solid ${accent}30`, marginTop: item.description || item.refPhotos?.length > 0 ? 4 : 0 }}
                >
                  <ExternalLink size={14} /> Abrir material de referência
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-1">
            {item.critical && (
              <span className="flex items-center gap-1" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.critical }}>
                <AlertTriangle size={12} /> Crítico
              </span>
            )}
            {item.required && (
              <span className="flex items-center gap-1" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: accent }}>
                <Lock size={12} /> Obrigatório
              </span>
            )}
            {item.photoRequired && (
              <span className="flex items-center gap-1" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: accent }}>
                <Camera size={12} /> Foto
              </span>
            )}
            {item.recurrence && item.recurrence.length > 0 && (
              <span className="flex items-center gap-1" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted }}>
                <Clock size={12} /> {item.recurrence.map(d => WEEKDAY_LABELS[d]).join('/')}
              </span>
            )}
          </div>

          {locked && (
            <p className="flex items-center gap-1 mt-1" style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>
              <Lock size={11} /> Conclua o item obrigatório anterior para liberar
            </p>
          )}

          {collabDone && (
            <div className="flex items-center gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
              <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, color: C.success }}>
                <CheckCircle2 size={12} /> Concluída por {byOther ? (liveInfo.operatorName || 'colega') : 'você'}
                {liveInfo.completedAt ? ` às ${new Date(liveInfo.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
              {onReopen && (
                <button onClick={onReopen}
                  style={{ fontSize: 11, fontWeight: 800, color: accent, background: 'none', border: `1px solid ${accent}`, borderRadius: 20, padding: '1px 9px', cursor: 'pointer' }}>
                  Reabrir
                </button>
              )}
            </div>
          )}

          <input
            value={state.note}
            onChange={e => onNote(e.target.value)}
            placeholder="Observação (opcional)"
            disabled={locked}
            className="mt-2 w-full px-2 py-1.5"
            style={{ fontSize: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, outline: 'none', color: C.ink }}
          />

          {item.photoRequired && !locked && (
            <div className="flex items-center gap-2 mt-2">
              {state.photo ? (
                <>
                  <img src={state.photo} alt="Comprovação" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, border: `1px solid ${C.border}` }} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ fontSize: 11, fontWeight: 800, color: accent, background: 'none', border: 'none', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                  >
                    Trocar foto
                  </button>
                </>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1"
                  style={{ fontSize: 11, fontWeight: 800, color: C.critical, background: 'none', border: `1px dashed ${C.critical}`, borderRadius: 4, padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                >
                  <Camera size={12} /> Anexar foto
                </button>
              )}
              <input
                ref={fileInputRef} type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) onPhoto(e.target.files[0]); }}
              />
            </div>
          )}

          {needsPhoto && !state.done && !locked && (
            <p style={{ fontSize: 11, fontWeight: 600, color: C.critical, marginTop: 4 }}>
              Anexe uma foto para concluir este item.
            </p>
          )}
        </div>

        {effDone && (
          <div
            className="font-mono-ibr"
            style={{
              flexShrink: 0, transform: 'rotate(-6deg)', border: `2px solid ${C.success}`, color: C.success,
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 6px', borderRadius: 4,
            }}
          >
            OK
          </div>
        )}
      </div>
    </Ticket>

    {/* Inline photo expansion modal */}
    {expandedPhoto && (
      <div
        onClick={() => setExpandedPhoto(null)}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <img
          src={expandedPhoto}
          alt="Referência"
          style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
          onClick={e => e.stopPropagation()}
        />
        <button
          onClick={() => setExpandedPhoto(null)}
          style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: 'white', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >×</button>
      </div>
    )}
    </>
  );
}

/* ----------------------------- confirm modal ------------------------------ */

function ConfirmModal({ items, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(32,48,43,0.5)' }}>
      <div className="w-full" style={{ maxWidth: 360, background: 'white', borderRadius: 10, padding: 16, border: `2px solid ${C.critical}` }}>
        <div className="flex items-center gap-2 mb-2" style={{ color: C.critical }}>
          <AlertTriangle size={20} />
          <h3 className="font-display" style={{ fontWeight: 800 }}>Itens críticos pendentes</h3>
        </div>
        <ul style={{ fontSize: 14, color: C.ink, paddingLeft: 18, marginBottom: 12 }}>
          {items.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
        </ul>
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Você pode concluir mesmo assim, mas o painel mostrará alerta para a gestão.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, fontWeight: 800, color: C.ink, background: 'white' }}>
            Voltar
          </button>
          <button onClick={onConfirm} className="flex-1 py-2" style={{ borderRadius: 6, border: 'none', fontWeight: 800, color: 'white', background: C.critical }}>
            Concluir assim
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- execution screen ----------------------------- */

function ExecutionScreen({ template, unit, currentUser, onCancel, onComplete }) {
  const [completionRecord, setCompletionRecord] = useState(null); // shows celebration when set
  const today = todayStr();
  const items = applicableItems(template, today);

  const [itemStates, setItemStates] = useState(() =>
    Object.fromEntries(items.map(i => [i.id, { done: false, note: '', photo: null }]))
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  // ── Execução colaborativa (H6) ─────────────────────────────────────────────
  const [liveByItem, setLiveByItem] = useState({});     // itemId → { done, operatorUserId, operatorName, completedAt }
  const [collabNotice, setCollabNotice] = useState('');
  const [reopenTarget, setReopenTarget] = useState(null);
  const [reopenReason, setReopenReason] = useState('');
  const collabSessionTracked = useRef(false);

  // Estado efetivo de conclusão: local OU compartilhado (por um colega em tempo real).
  const effDone = id => itemStates[id]?.done || !!liveByItem[id]?.done;

  useEffect(() => {
    const applyLive = map => {
      setLiveByItem(map);
      const ops = new Set(Object.values(map).filter(v => v?.done && v.operatorUserId).map(v => v.operatorUserId));
      if (ops.size >= 2 && !collabSessionTracked.current) {
        collabSessionTracked.current = true;
        track('collaborative_session', { source: 'checklist', checklistId: template.id, unitId: unit.id, metadata: { operators: ops.size } });
      }
    };
    fetchLiveTasks(template.id, unit.id, today).then(applyLive);
    const unsub = subscribeLiveTasks(template.id, unit.id, today, () => fetchLiveTasks(template.id, unit.id, today).then(applyLive));
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneCount = items.filter(i => effDone(i.id)).length;
  const total = items.length;
  const pendingCritical = items.filter(i => i.critical && !effDone(i.id));

  const isLocked = idx => {
    for (let j = 0; j < idx; j++) {
      const prev = items[j];
      if (prev.required && !effDone(prev.id)) return true;
    }
    return false;
  };

  const toggle = (item, idx) => {
    if (isLocked(idx)) return;
    const live = liveByItem[item.id];
    // Já concluída por um colega → bloqueia nova execução (H6).
    if (live?.done && live.operatorUserId && live.operatorUserId !== currentUser.id) {
      track('duplicate_execution_blocked', { source: 'checklist', checklistId: template.id, taskId: item.id, unitId: unit.id, metadata: { by: live.operatorName || null } });
      setCollabNotice(`"${truncName(item.text, 32)}" já foi concluída por ${live.operatorName || 'um colega'}.`);
      setTimeout(() => setCollabNotice(''), 2600);
      return;
    }
    // Já concluída por mim no estado compartilhado → reabrir exige motivo (auditoria).
    if (live?.done && live.operatorUserId === currentUser.id) {
      setReopenTarget(item);
      return;
    }
    const state = itemStates[item.id];
    if (!state.done && item.photoRequired && !state.photo) return;
    const nextDone = !state.done;
    setItemStates(s => ({ ...s, [item.id]: { ...s[item.id], done: nextDone } }));
    // Compartilha no estado ao vivo (fire-and-forget; degrada sem a tabela).
    setLiveTask({ templateId: template.id, unitId: unit.id, date: today, itemId: item.id, done: nextDone, operatorUserId: currentUser.id, operatorName: currentUser.name });
    setLiveByItem(m => ({ ...m, [item.id]: nextDone
      ? { done: true, operatorUserId: currentUser.id, operatorName: currentUser.name, completedAt: new Date().toISOString() }
      : { ...m[item.id], done: false } }));
  };

  const confirmReopen = () => {
    const item = reopenTarget;
    if (!item) return;
    reopenLiveTask({ templateId: template.id, unitId: unit.id, date: today, itemId: item.id, operatorUserId: currentUser.id, operatorName: currentUser.name });
    track('task_reopened', { source: 'checklist', checklistId: template.id, taskId: item.id, unitId: unit.id, metadata: { reason: reopenReason.trim() || null } });
    setItemStates(s => ({ ...s, [item.id]: { ...s[item.id], done: false } }));
    setLiveByItem(m => ({ ...m, [item.id]: { ...m[item.id], done: false } }));
    setReopenTarget(null); setReopenReason('');
  };
  const setNote = (id, note) => setItemStates(s => ({ ...s, [id]: { ...s[id], note } }));
  const setPhoto = async (id, file) => {
    try {
      const dataUrl = await compressImage(file);
      setItemStates(s => ({ ...s, [id]: { ...s[id], photo: dataUrl, photoDataUrl: dataUrl } }));
    } catch (e) { console.error(e); }
  };

  const submit = async () => {
    const recordId = uid();
    const record = {
      id: recordId,
      templateId: template.id,
      templateName: template.name,
      unitId: unit.id,
      sector: template.sector,
      shift: shiftLabel(template),
      date: today,
      completedAt: new Date().toISOString(),
      operatorName: currentUser.name,
      operatorUserId: currentUser.id,
      items: items.map(i => ({
        id: i.id, text: i.text, critical: i.critical, required: !!i.required,
        done: itemStates[i.id].done || !!liveByItem[i.id]?.done, note: itemStates[i.id].note,
        hasPhoto: !!itemStates[i.id].photo,
      })),
    };

    // Upload photos to Supabase Storage (falls back to local cache if offline)
    for (const i of items) {
      const photo = itemStates[i.id].photo;
      if (photo) {
        try { await uploadPhoto(recordId, i.id, photo); } catch (e) { console.error(e); }
      }
    }

    setCompletionRecord(record); // show celebration first
  };

  const finish = () => {
    const missingPhoto = items.find(i => i.photoRequired && !itemStates[i.id].photo);
    if (missingPhoto) { setError(`Anexe a foto exigida em "${missingPhoto.text}".`); return; }
    setError('');
    if (pendingCritical.length > 0) { setShowConfirm(true); return; }
    submit();
  };

  // Celebration screen after completion
  if (completionRecord) {
    const done = completionRecord.items.filter(i => i.done).length;
    const total = completionRecord.items.length;
    const rate = Math.round((done / total) * 100);
    const criticalMissed = completionRecord.items.filter(i => i.critical && !i.done).length;
    const levels = [
      { min: 100, emoji: '🏆', title: 'Perfeito!', msg: 'Todos os itens concluídos. Excelente trabalho!', color: C.success },
      { min: 90,  emoji: '⭐', title: 'Excelente!', msg: 'Quase tudo concluído. Continue assim!', color: C.success },
      { min: 75,  emoji: '👍', title: 'Bom trabalho!', msg: 'A maioria dos itens foi concluída.', color: unit.color },
      { min: 50,  emoji: '📈', title: 'Checklist registrado', msg: 'Você pode melhorar! Tente concluir mais itens amanhã.', color: '#C6842A' },
      { min: 0,   emoji: '⚠️', title: 'Registrado com pendências', msg: 'Muitos itens ficaram pendentes. Priorize-os no próximo turno.', color: C.critical },
    ];
    const level = levels.find(l => rate >= l.min);
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ fontSize: 72, marginBottom: 12, lineHeight: 1 }}>{level.emoji}</div>
        <p className="font-display" style={{ fontSize: 26, fontWeight: 800, color: level.color, textAlign: 'center', marginBottom: 8 }}>{level.title}</p>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center', maxWidth: 280, lineHeight: 1.6, marginBottom: 20 }}>{level.msg}</p>
        <div style={{ background: 'white', borderRadius: 14, padding: '16px 24px', border: `2px solid ${level.color}30`, textAlign: 'center', marginBottom: 20, minWidth: 200 }}>
          <p style={{ fontSize: 48, fontWeight: 800, color: level.color, lineHeight: 1 }}>{rate}%</p>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{done} de {total} itens</p>
          {criticalMissed > 0 && (
            <p style={{ fontSize: 12, color: C.critical, fontWeight: 700, marginTop: 6 }}>⚠ {criticalMissed} crítico{criticalMissed > 1 ? 's' : ''} pendente{criticalMissed > 1 ? 's' : ''}</p>
          )}
          <div style={{ width: '100%', height: 6, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
            <div style={{ height: '100%', width: `${rate}%`, background: level.color, borderRadius: 999 }} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 24 }}>
          {template.name} · {template.sector} · {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <button onClick={() => onComplete(completionRecord)}
          style={{ padding: '14px 40px', borderRadius: 12, background: unit.color, color: 'white', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
          Concluir →
        </button>
      </div>
    );
  }

  return (
    <div className="p-4" style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 0px))" }}>
      <BackBar onBack={onCancel} label={template.sector} accent={unit.color}
        motiv={(() => {
          const n = (template.name || '').toLowerCase();
          const isArray = Array.isArray(template.shift);
          if (n.includes('abertura') || (!isArray && template.shift === 'Manhã')) return 'Faça um excelente dia! ☀️';
          if (n.includes('fechamento') || (!isArray && template.shift === 'Tarde')) return 'Bom descanso! 🌙';
          return null;
        })()}
      />
      <div className="mb-3">
        <h2 className="font-display" style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{template.name}</h2>
        {template.deadline && <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Prazo até {template.deadline}</p>}
      </div>

      <div className="mb-3">
        <Ticket accent={unit.color}>
          <div className="flex items-center gap-2">
            <div style={{ width: 28, height: 28, borderRadius: 999, background: `${ROLE_COLORS[currentUser.role]}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={14} color={ROLE_COLORS[currentUser.role]} />
            </div>
            <div>
              <Eyebrow>Responsável</Eyebrow>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginTop: 1 }}>{currentUser.name}</p>
            </div>
          </div>
        </Ticket>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => (
          <ItemRow
            key={item.id} item={item} state={itemStates[item.id]} accent={unit.color}
            locked={isLocked(idx)}
            liveInfo={liveByItem[item.id]} currentUserId={currentUser.id}
            onReopen={liveByItem[item.id]?.done ? () => setReopenTarget(item) : undefined}
            onToggle={() => toggle(item, idx)} onNote={v => setNote(item.id, v)}
            onPhoto={file => setPhoto(item.id, file)}
          />
        ))}
      </div>

      {error && <p style={{ fontSize: 12, fontWeight: 800, color: C.critical, marginTop: 8 }}>{error}</p>}

      <div className="fixed left-0 right-0 p-3" style={{ bottom: "calc(56px + env(safe-area-inset-bottom, 0px))", background: 'rgba(250,246,239,0.96)', borderTop: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>{doneCount} de {total} concluídos</span>
          <div style={{ width: 120, height: 6, background: C.border, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(doneCount / total) * 100}%`, background: unit.color }} />
          </div>
        </div>
        <button
          onClick={finish}
          className="font-display w-full py-3"
          style={{ borderRadius: 6, border: 'none', fontWeight: 800, color: C.bg, background: unit.color }}
        >
          Concluir checklist
        </button>
      </div>

      {showConfirm && (
        <ConfirmModal
          items={pendingCritical.map(i => i.text)}
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => { setShowConfirm(false); submit(); }}
        />
      )}

      {/* Aviso de execução colaborativa bloqueada (H6) */}
      {collabNotice && (
        <div style={{ position: 'fixed', bottom: 'calc(120px + env(safe-area-inset-bottom,0px))', left: 16, right: 16, zIndex: 300, background: C.ink, color: 'white', borderRadius: 12, padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
          🔒 {collabNotice}
        </div>
      )}

      {/* Reabrir tarefa — exige motivo (auditoria, H6) */}
      {reopenTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 310, background: 'rgba(6,60,92,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 480, background: C.bg, borderRadius: '20px 20px 0 0', padding: 18, paddingBottom: 'calc(18px + env(safe-area-inset-bottom,0px))' }}>
            <p className="font-display" style={{ fontSize: 17, fontWeight: 800, color: C.ink, marginBottom: 6 }}>Reabrir tarefa</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12, lineHeight: 1.4 }}>
              "{truncName(reopenTarget.text, 44)}" será marcada como pendente. Registre o motivo para a auditoria.
            </p>
            <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} rows={3}
              placeholder="Motivo da reabertura (ex.: precisa refazer, ficou incompleto)"
              style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, resize: 'none', marginBottom: 14, background: 'white', color: C.ink }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setReopenTarget(null); setReopenReason(''); }}
                style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: 'white', color: C.muted, border: `1px solid ${C.border}`, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmReopen}
                style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: C.critical, color: 'white', border: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                Reabrir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ executar view ------------------------------ */

// Fixed display order for the three checklist types
// Returns the list of sectors visible to a user based on their sectorId
// (IBR1 only — other units see all sectors)
function visibleSectors(unit, sectorId) {
  if (!sectorId || unit.id !== 'ibr1') return unit.sectors;
  if (sectorId === 'salao') return unit.sectors.filter(s => s === 'Salão');
  if (sectorId === 'cozinha') return unit.sectors.filter(s => s === 'Cozinha');
  return unit.sectors;
}

const CHECKLIST_TYPE_ORDER = [
  { key: 'abertura',     label: 'Abertura',      match: t => t.name.toLowerCase().includes('abertura') },
  { key: 'intermediario',label: 'Intermediário', match: t => t.name.toLowerCase().includes('intermedi') },
  { key: 'fechamento',   label: 'Fechamento',    match: t => t.name.toLowerCase().includes('fechamento') },
];

function ExecutarView({ unit, templates, completions, closures, currentUser, onSaveCompletion }) {
  const [checklistType, setChecklistType] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const today = todayStr();
  const sectors = visibleSectors(unit, currentUser?.sectorId);

  if (activeTemplate) {
    return (
      <ExecutionScreen
        template={activeTemplate} unit={unit} currentUser={currentUser}
        onCancel={() => setActiveTemplate(null)}
        onComplete={record => { onSaveCompletion(record); setActiveTemplate(null); }}
      />
    );
  }

  if (isUnitClosed(closures, unit.id, today)) {
    return (
      <div className="p-4 flex flex-col items-center justify-center" style={{ minHeight: 300 }}>
        <Calendar size={40} color={C.mutedLight} />
        <p className="font-display" style={{ fontWeight: 800, fontSize: 18, color: C.ink, textAlign: 'center', marginTop: 16 }}>
          {unit.name} está fechada hoje
        </p>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 8, textAlign: 'center' }}>
          Este dia foi marcado como folga. Nenhum checklist é necessário.
        </p>
      </div>
    );
  }

  // Level 2: praças for the selected checklist type
  if (checklistType) {
    const typeConfig = CHECKLIST_TYPE_ORDER.find(c => c.key === checklistType);
    // Get all templates for this type in visible sectors
    const typeTemplates = templates.filter(t =>
      t.unitId === unit.id &&
      sectors.includes(t.sector) &&
      typeConfig.match(t) &&
      applicableItems(t, today).length > 0
    ).sort((a, b) => a.name.localeCompare(b.name));

    // Group by sector for IBR1 (has praças), flat for IBR2/3
    const isIbr1 = unit.id === 'ibr1';
    const grouped = isIbr1
      ? ['Salão', 'Cozinha'].map(s => ({
          sector: s,
          templates: typeTemplates.filter(t => t.sector === s),
        })).filter(g => g.templates.length > 0)
      : [{ sector: null, templates: typeTemplates }];

    return (
      <div className="p-4 space-y-3">
        <BackBar onBack={() => setChecklistType(null)} label={typeConfig.label} accent={unit.color} />
        {grouped.map(({ sector, templates: ts }) => (
          <div key={sector || 'all'}>
            {sector && <Eyebrow>{sector}</Eyebrow>}
            <div className="space-y-2">
              {ts.map(t => {
                const status = templateStatus(t, completions, today);
                const count = applicableItems(t, today).length;
                // Extract praça name — format is "Praça — Tipo (detalhes)"
                const displayName = t.name.includes(' — ') ? t.name.split(' — ')[0] : t.sector;
                return (
                  <button key={t.id} onClick={() => setActiveTemplate(t)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                    <Ticket accent={STATUS_CFG[status].color}>
                      <div className="flex items-center justify-between gap-2">
                        <div style={{ minWidth: 0 }}>
                          <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{displayName}</p>
                          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                            {count} item{count > 1 ? 's' : ''} hoje{t.deadline ? ` · até ${t.deadline}` : ''}
                          </p>
                        </div>
                        <StatusBadge status={status} />
                      </div>
                    </Ticket>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Level 1: checklist types
  return (
    <div className="p-4 space-y-3">
      <Eyebrow>{unit.name}</Eyebrow>
      <div className="space-y-2">
        {CHECKLIST_TYPE_ORDER.map(({ key, label, match }) => {
          const list = templates.filter(t =>
            t.unitId === unit.id && match(t) && applicableItems(t, today).length > 0 &&
            sectors.includes(t.sector)
          );
          const done = list.filter(t => templateStatus(t, completions, today) === 'done').length;
          const total = list.length;
          const overdue = list.filter(t => templateStatus(t, completions, today) === 'overdue').length;
          if (total === 0) return null;
          const unitLabel = unit.id === 'ibr1' ? 'praça' : 'setor';
          return (
            <button key={key} onClick={() => setChecklistType(key)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
              <Ticket accent={unit.color}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{label}</p>
                    <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {done}/{total} {unitLabel}{total > 1 ? 's' : ''} concluída{total > 1 ? 's' : ''}
                      {overdue > 0 && <span style={{ color: C.critical, fontWeight: 800 }}> · {overdue} atrasada{overdue > 1 ? 's' : ''}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {done === total
                      ? <CheckCircle2 size={20} color={C.success} />
                      : <ChevronRight size={16} color={C.muted} />}
                  </div>
                </div>
              </Ticket>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- painel view -------------------------------- */

function PhotoModal({ recordId, item, onClose }) {
  const [src, setSrc] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    (async () => {
      try {
        const url = await getPhotoUrl(recordId, item.id);
        if (url) {
          setSrc(url);
          setStatus('ok');
        } else {
          setStatus('error');
        }
      } catch (e) {
        setStatus('error');
      }
    })();
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(32,48,43,0.6)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full" style={{ maxWidth: 360, background: 'white', borderRadius: 10, padding: 16 }}>
        <p className="font-display" style={{ fontWeight: 800, color: C.ink, marginBottom: 8 }}>{item.text}</p>
        {status === 'loading' && <p style={{ fontSize: 13, color: C.muted }}>Carregando foto…</p>}
        {status === 'error' && <p style={{ fontSize: 13, color: C.critical }}>Não foi possível carregar a foto.</p>}
        {status === 'ok' && <img src={src} alt={item.text} style={{ width: '100%', borderRadius: 8 }} />}
        {item.note && <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Obs: {item.note}</p>}
        <button onClick={onClose} className="w-full mt-3 py-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, fontWeight: 800, color: C.ink, background: 'white' }}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function PainelView({ unit, templates, completions, closures, canSeeAllUnits, currentUser, users }) {
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const viewDate = selectedDate;

  // For IBR1: allow gestão/gerência/liderança to switch between sector views
  const hasMultipleSectors = unit.id === 'ibr1';
  const [activeSectorGroup, setActiveSectorGroup] = useState(
    currentUser?.sectorId || (hasMultipleSectors && (currentUser?.role === 'gestao' || currentUser?.role === 'gerencia' || currentUser?.role === 'lideranca') ? 'all' : currentUser?.sectorId || null)
  );

  // Resolve which physical sectors to show
  const getSectorList = (groupId) => {
    if (!hasMultipleSectors || !groupId || groupId === 'all') return unit.sectors;
    if (groupId === 'salao') return unit.sectors.filter(s => s === 'Salão');
    if (groupId === 'cozinha') return unit.sectors.filter(s => s === 'Cozinha');
    return unit.sectors;
  };

  const canSwitchSectors = hasMultipleSectors && ['gestao', 'gerencia', 'lideranca'].includes(currentUser?.role);
  const sectors = currentUser?.sectorId ? visibleSectors(unit, currentUser.sectorId) : getSectorList(activeSectorGroup);

  const shiftDate = (delta) => {
    const d = new Date(`${viewDate}T00:00:00`);
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (next <= today) setSelectedDate(next);
  };

  const dateLabel = viewDate === today
    ? 'Hoje'
    : new Date(`${viewDate}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();

  // ── Rate calculation ─────────────────────────────────────────────────────
  const calcRate = (date, unitId, filterSectors) => {
    if (isUnitClosed(closures, unitId, date)) return null;
    const dayTemplates = templates.filter(t =>
      t.unitId === unitId &&
      filterSectors.includes(t.sector) &&
      applicableItems(t, date).length > 0
    );
    if (dayTemplates.length === 0) return null;
    let done = 0, total = 0;
    for (const t of dayTemplates) {
      const comp = completions.find(c => c.templateId === t.id && c.date === date);
      const applicable = applicableItems(t, date);
      total += applicable.length;
      done += comp ? comp.items.filter(i => i.done).length : 0;
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  // ── Collaborator ranking ──────────────────────────────────────────────────
  const calcRanking = (dateRange) => {
    const relevant = completions.filter(c =>
      c.unitId === unit.id &&
      (!dateRange || dateRange.includes(c.date))
    );
    const byUser = {};
    for (const c of relevant) {
      const key = c.operatorUserId || c.operatorName;
      if (!key) continue;
      if (!byUser[key]) byUser[key] = { key, name: c.operatorName, done: 0, total: 0, checklists: 0 };
      byUser[key].checklists++;
      byUser[key].done += (c.items || []).filter(i => i.done).length;
      byUser[key].total += (c.items || []).length;
    }
    return Object.values(byUser)
      .map(u => ({ ...u, rate: u.total > 0 ? Math.round((u.done / u.total) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate || b.checklists - a.checklists);
  };

  const yesterday = (() => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
  // last7 includes today + 6 previous days
  const last7 = Array.from({length:7},(_,i)=>{ const d=new Date(`${today}T00:00:00`); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10); });

  const rateToday = calcRate(viewDate, unit.id, sectors);
  const rateYesterday = viewDate === today ? calcRate(yesterday, unit.id, sectors) : null;
  const rates7 = last7.map(d => calcRate(d, unit.id, sectors)).filter(r => r !== null);
  const avg7 = rates7.length ? Math.round(rates7.reduce((a,b)=>a+b,0)/rates7.length) : null;

  // ── Sector comparison (IBR1 gestão only) ─────────────────────────────────
  const sectorGroups = hasMultipleSectors ? [
    { id: 'salao',   label: 'Salão',   sectors: unit.sectors.filter(s => s === 'Salão') },
    { id: 'cozinha', label: 'Cozinha', sectors: unit.sectors.filter(s => s === 'Cozinha') },
  ] : [];
  const sectorComparison = canSwitchSectors ? sectorGroups.map(sg => ({
    ...sg,
    rate: calcRate(viewDate, unit.id, sg.sectors),
    avg7: (() => {
      const r = last7.map(d => calcRate(d, unit.id, sg.sectors)).filter(r => r !== null);
      return r.length ? Math.round(r.reduce((a,b)=>a+b,0)/r.length) : null;
    })(),
  })) : [];

  // ── Collaborator ranking ──────────────────────────────────────────────────
  const ranking7 = calcRanking(last7);

  // ── Gamification: score & label ──────────────────────────────────────────
  const getRating = (rate) => {
    if (rate === null) return null;
    if (rate === 100) return { label: '🏆 Perfeito!', color: '#F5A623', stars: 5 };
    if (rate >= 90)  return { label: '⭐ Excelente', color: C.success, stars: 4 };
    if (rate >= 75)  return { label: '👍 Bom', color: C.success, stars: 3 };
    if (rate >= 50)  return { label: '📈 Regular', color: unit.color, stars: 2 };
    return { label: '⚠ Precisa melhorar', color: C.critical, stars: 1 };
  };

  const rating = getRating(rateToday);
  const unitCompletions = completions.filter(c => c.unitId === unit.id && sectors.includes(c.sector));

  return (
    <div className="p-4 space-y-4" style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>

      {/* Date navigator */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => shiftDate(-1)} style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <ArrowLeft size={16} color={C.ink} />
        </button>
        <div className="flex-1 flex flex-col items-center">
          <p className="font-display" style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>{dateLabel}</p>
          <input type="date" value={viewDate} max={today} onChange={e => setSelectedDate(e.target.value)}
            style={{ fontSize: 11, color: C.muted, background: 'none', border: 'none', outline: 'none', textAlign: 'center', cursor: 'pointer' }} />
        </div>
        <button onClick={() => shiftDate(1)} disabled={viewDate >= today}
          style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: viewDate >= today ? 'default' : 'pointer', opacity: viewDate >= today ? 0.3 : 1 }}>
          <ChevronRight size={16} color={C.ink} />
        </button>
      </div>

      {/* IBR1 sector switcher for gestão/gerência/liderança */}
      {canSwitchSectors && (
        <div className="flex gap-2">
          <PillButton active={activeSectorGroup === 'all'} accent={unit.color} onClick={() => setActiveSectorGroup('all')}>Geral</PillButton>
          {sectorGroups.map(sg => (
            <PillButton key={sg.id} active={activeSectorGroup === sg.id} accent={unit.color} onClick={() => setActiveSectorGroup(sg.id)}>{sg.label}</PillButton>
          ))}
        </div>
      )}

      {/* Sector comparison (IBR1 gestão — only when "Geral" is selected) */}
      {canSwitchSectors && activeSectorGroup === 'all' && sectorComparison.length > 0 && (
        <>
          <Eyebrow>Comparativo de setores — {dateLabel}</Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            {sectorComparison.map(sg => {
              const r = sg.rate;
              const sgRating = getRating(r);
              return (
                <button key={sg.id} onClick={() => setActiveSectorGroup(sg.id)}
                  className="text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                  <Ticket accent={r !== null && r >= 80 ? C.success : r !== null && r < 50 ? C.critical : unit.color}>
                    <p className="font-display" style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>{sg.label}</p>
                    <p className="font-display" style={{ fontSize: 32, fontWeight: 800, color: unit.color, lineHeight: 1, margin: '4px 0' }}>
                      {r !== null ? `${r}%` : '—'}
                    </p>
                    {sgRating && (
                      <div>
                        {[1,2,3,4,5].map(s => (
                          <span key={s} style={{ fontSize: 12, opacity: s <= sgRating.stars ? 1 : 0.2 }}>★</span>
                        ))}
                      </div>
                    )}
                    {sg.avg7 !== null && (
                      <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        Média 7d: {sg.avg7}%
                        <span style={{ marginLeft: 4, color: r !== null && r > sg.avg7 ? C.success : r !== null && r < sg.avg7 ? C.critical : C.muted, fontWeight: 800 }}>
                          {r !== null && r > sg.avg7 ? ' ▲' : r !== null && r < sg.avg7 ? ' ▼' : ' ='}
                        </span>
                      </p>
                    )}
                    <div style={{ width: '100%', height: 4, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
                      <div style={{ height: '100%', width: `${r ?? 0}%`, background: r >= 80 ? C.success : r >= 50 ? unit.color : C.critical }} />
                    </div>
                  </Ticket>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Cross-store comparative dashboard — gestão/gerência only */}
      {canSeeAllUnits && (
        <>
          <Eyebrow>Comparativo entre lojas — {dateLabel}</Eyebrow>

          {/* Main comparison cards */}
          <div className="flex flex-col gap-3">
            {UNITS.map((u, idx) => {
              const unitClosed = isUnitClosed(closures, u.id, viewDate);
              const rate = unitClosed ? null : calcRate(viewDate, u.id, u.sectors);
              const rateYest = calcRate(yesterday, u.id, u.sectors);
              const last7u = last7.map(d => calcRate(d, u.id, u.sectors));
              const avg = last7u.filter(v => v !== null).length > 0
                ? Math.round(last7u.filter(v => v !== null).reduce((a,b) => a+b,0) / last7u.filter(v => v !== null).length)
                : null;
              const trend = rate !== null && avg !== null ? rate - avg : null;
              const getRating = (r) => {
                if (r === null) return null;
                if (r === 100) return { label: '🏆 Perfeito', color: '#2F6F5E' };
                if (r >= 90) return { label: '⭐ Excelente', color: '#2F6F5E' };
                if (r >= 75) return { label: '👍 Bom', color: u.color };
                if (r >= 50) return { label: '📈 Regular', color: '#C6842A' };
                return { label: '⚠ Atenção', color: C.critical };
              };
              const rating = getRating(rate);

              // Turno breakdown
              const turnoRate = (shift) => {
                const shiftTemplates = templates.filter(t =>
                  t.unitId === u.id &&
                  (Array.isArray(t.shift) ? t.shift.includes(shift) : t.shift === shift) &&
                  applicableItems(t, viewDate).length > 0
                );
                if (shiftTemplates.length === 0) return null;
                let done = 0, total = 0;
                for (const t of shiftTemplates) {
                  const comp = completions.find(c => c.templateId === t.id && c.date === viewDate);
                  total += applicableItems(t, viewDate).length;
                  done += comp ? comp.items.filter(i => i.done).length : 0;
                }
                return total > 0 ? Math.round((done/total)*100) : 0;
              };

              const rankLabel = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
              const sortedUnits = [...UNITS].sort((a, b) => {
                const ra = isUnitClosed(closures, a.id, viewDate) ? -1 : (calcRate(viewDate, a.id, a.sectors) ?? -1);
                const rb = isUnitClosed(closures, b.id, viewDate) ? -1 : (calcRate(viewDate, b.id, b.sectors) ?? -1);
                return rb - ra;
              });
              const rank = sortedUnits.findIndex(su => su.id === u.id);

              return (
                <Ticket key={u.id} accent={u.color}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p style={{ fontSize: 13, fontWeight: 800, color: u.color }}>{u.name}</p>
                        {!unitClosed && rate !== null && (
                          <span style={{ fontSize: 13 }}>{['🥇','🥈','🥉'][rank] ?? ''}</span>
                        )}
                      </div>
                      {unitClosed
                        ? <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Fechada hoje</p>
                        : <p className="font-display" style={{ fontSize: 36, fontWeight: 800, color: C.ink, lineHeight: 1, marginTop: 4 }}>{rate ?? '—'}%</p>
                      }
                      {rating && <p style={{ fontSize: 11, fontWeight: 700, color: rating.color, marginTop: 2 }}>{rating.label}</p>}
                    </div>
                    {!unitClosed && trend !== null && (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>vs média 7d</p>
                        <p style={{ fontSize: 18, fontWeight: 800, color: trend >= 0 ? C.success : C.critical }}>
                          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
                        </p>
                        <p style={{ fontSize: 11, color: C.muted }}>média {avg}%</p>
                      </div>
                    )}
                  </div>

                  {!unitClosed && rate !== null && (
                    <>
                      {/* Progress bar */}
                      <div style={{ width: '100%', height: 5, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
                        <div style={{ height: '100%', width: `${rate}%`, background: (rate>=80)?C.success:(rate>=50)?u.color:C.critical, borderRadius: 999, transition: 'width 0.5s ease' }} />
                      </div>

                      {/* Turno breakdown */}
                      <div className="flex gap-2 mt-3">
                        {[{label:'Abertura', shift:'Manhã'},{label:'Intermediário', shift:'Tarde'},{label:'Fechamento', shift:'Tarde'}].map(({label, shift}) => {
                          const r = turnoRate(shift);
                          return r !== null ? (
                            <div key={label} style={{ flex:1, background: C.bg, borderRadius: 6, padding: '4px 6px', textAlign:'center' }}>
                              <p style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform:'uppercase' }}>{label.slice(0,4)}</p>
                              <p style={{ fontSize: 13, fontWeight: 800, color: r>=80?C.success:r>=50?u.color:C.critical }}>{r}%</p>
                            </div>
                          ) : null;
                        })}

                        {/* Sparkline */}
                        <div style={{ flex: 2, background: C.bg, borderRadius: 6, padding: '4px 8px', display:'flex', alignItems:'center', gap: 2 }}>
                          {last7u.map((v, i) => (
                            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', height: 20 }}>
                              <div style={{ width:'100%', background: v===null?C.border:v>=80?C.success:v>=50?u.color:C.critical, borderRadius: 2, height: v===null?2:`${Math.max(2, (v/100)*20)}px`, opacity: i===6?1:0.6+i*0.06 }} />
                            </div>
                          ))}
                          <p style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginLeft: 2 }}>7d</p>
                        </div>
                      </div>
                    </>
                  )}
                </Ticket>
              );
            })}
          </div>

          {/* Ranking geral entre lojas */}
          {(() => {
            const sorted = [...UNITS]
              .map(u => ({
                u,
                rate: isUnitClosed(closures, u.id, viewDate) ? null : calcRate(viewDate, u.id, u.sectors)
              }))
              .filter(x => x.rate !== null)
              .sort((a,b) => b.rate - a.rate);
            if (sorted.length < 2) return null;
            return (
              <>
                <Eyebrow>Ranking do dia</Eyebrow>
                <div className="flex flex-col gap-2">
                  {sorted.map(({u, rate}, i) => (
                    <div key={u.id} className="flex items-center gap-3" style={{ padding: '8px 12px', background: 'white', borderRadius: 10, border: `1.5px solid ${C.border}` }}>
                      <span style={{ fontSize: 18 }}>{['🥇','🥈','🥉'][i]}</span>
                      <p style={{ flex:1, fontSize: 14, fontWeight: 800, color: u.color }}>{u.name}</p>
                      <p className="font-display" style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{rate}%</p>
                      <div style={{ width: 60, height: 4, background: C.border, borderRadius: 999, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${rate}%`, background: rate>=80?C.success:rate>=50?u.color:C.critical }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </>
      )}

      {/* ── GAMIFIED SCORE CARD ── */}
      {isUnitClosed(closures, unit.id, viewDate) ? (
        <Ticket accent={C.muted}>
          <div className="flex items-center gap-2">
            <Calendar size={18} color={C.muted} />
            <p style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>Loja fechada — nenhum checklist necessário.</p>
          </div>
        </Ticket>
      ) : (
        <>
          {/* Main score */}
          <div className="p-4" style={{ background: unit.color, borderRadius: 12 }}>
            <div className="flex items-end justify-between">
              <div>
                <p style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {unit.name}{currentUser?.sectorId ? ` · ${currentUser.sectorId === 'salao' ? 'Salão' : 'Cozinha'}` : ''}
                </p>
                <p className="font-display" style={{ fontSize: 56, fontWeight: 800, color: 'white', lineHeight: 1, marginTop: 4 }}>
                  {rateToday !== null ? `${rateToday}%` : '—'}
                </p>
                {rating && <p style={{ fontSize: 15, fontWeight: 800, color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>{rating.label}</p>}
              </div>
              {rating && (
                <div style={{ textAlign: 'right' }}>
                  {[1,2,3,4,5].map(s => (
                    <span key={s} style={{ fontSize: 20, opacity: s <= rating.stars ? 1 : 0.25 }}>★</span>
                  ))}
                </div>
              )}
            </div>
            {/* Progress bar */}
            {rateToday !== null && (
              <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden', marginTop: 16 }}>
                <div style={{ height: '100%', width: `${rateToday}%`, background: 'white', borderRadius: 999, transition: 'width 0.6s ease' }} />
              </div>
            )}
          </div>

          {/* Comparison row */}
          {(rateYesterday !== null || avg7 !== null) && (
            <div className="grid grid-cols-2 gap-2">
              {rateYesterday !== null && (
                <Ticket accent={C.border}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ontem</p>
                  <p className="font-display" style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginTop: 2 }}>{rateYesterday}%</p>
                  {rateToday !== null && (
                    <p style={{ fontSize: 12, fontWeight: 800, marginTop: 4,
                      color: rateToday > rateYesterday ? C.success : rateToday < rateYesterday ? C.critical : C.muted }}>
                      {rateToday > rateYesterday ? `▲ +${rateToday - rateYesterday}pp` :
                       rateToday < rateYesterday ? `▼ ${rateToday - rateYesterday}pp` : '= igual'}
                    </p>
                  )}
                </Ticket>
              )}
              {avg7 !== null && (
                <Ticket accent={C.border}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Média 7 dias</p>
                  <p className="font-display" style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginTop: 2 }}>{avg7}%</p>
                  {rateToday !== null && (
                    <p style={{ fontSize: 12, fontWeight: 800, marginTop: 4,
                      color: rateToday > avg7 ? C.success : rateToday < avg7 ? C.critical : C.muted }}>
                      {rateToday > avg7 ? `▲ acima da média` : rateToday < avg7 ? `▼ abaixo da média` : '= na média'}
                    </p>
                  )}
                </Ticket>
              )}
            </div>
          )}

          {/* 7-day sparkline */}
          {rates7.length > 0 && (
            <Ticket accent={C.border}>
              <Eyebrow>Últimos 7 dias</Eyebrow>
              <div className="flex items-end gap-1 mt-3" style={{ height: 40 }}>
                {[...rates7].reverse().map((r, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div style={{
                      width: '100%', height: `${Math.max(4, r * 0.4)}px`,
                      background: r >= 80 ? C.success : r >= 50 ? unit.color : C.critical,
                      borderRadius: 3, transition: 'height 0.3s ease',
                    }} />
                    <p style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>{r}%</p>
                  </div>
                ))}
              </div>
            </Ticket>
          )}

          {/* Per-type breakdown */}
          <Eyebrow>Por tipo de checklist</Eyebrow>
          {CHECKLIST_TYPE_ORDER.map(({ key, label, match }) => {
            const typeTemplates = templates.filter(t =>
              t.unitId === unit.id && match(t) &&
              sectors.includes(t.sector) &&
              applicableItems(t, viewDate).length > 0
            );
            if (typeTemplates.length === 0) return null;
            const allDone = typeTemplates.every(t => templateStatus(t, completions, viewDate) === 'done');
            const anyOverdue = typeTemplates.some(t => templateStatus(t, completions, viewDate) === 'overdue');
            const doneCount = typeTemplates.filter(t => templateStatus(t, completions, viewDate) === 'done').length;
            return (
              <Ticket key={key} accent={allDone ? C.success : anyOverdue ? C.critical : unit.color}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-display" style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{label}</p>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 12, fontWeight: 800, color: allDone ? C.success : anyOverdue ? C.critical : unit.color }}>
                      {doneCount}/{typeTemplates.length}
                    </span>
                    {allDone && <CheckCircle2 size={16} color={C.success} />}
                    {anyOverdue && !allDone && <AlertTriangle size={16} color={C.critical} />}
                  </div>
                </div>
                <div className="space-y-2">
                  {sectors.map(sector => {
                    const t = typeTemplates.find(t => t.sector === sector);
                    if (!t) return null;
                    const status = templateStatus(t, completions, viewDate);
                    const comp = completions.find(c => c.templateId === t.id && c.date === viewDate);
                    const applicable = applicableItems(t, viewDate);
                    const doneItems = comp ? comp.items.filter(i => i.done).length : 0;
                    const totalItems = comp ? comp.items.length : applicable.length;
                    const photoItems = comp ? comp.items.filter(i => i.hasPhoto) : [];
                    return (
                      <div key={sector}>
                        <div className="flex items-center justify-between gap-2">
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{sector}</p>
                            <p style={{ fontSize: 11, color: C.muted }}>
                              {comp
                                ? `${comp.operatorName} · ${new Date(comp.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                                : t.deadline ? `até ${t.deadline}` : 'pendente'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                            <span className="font-mono-ibr" style={{ fontSize: 12, fontWeight: 600, color: doneItems === totalItems && totalItems > 0 ? C.success : C.muted }}>
                              {doneItems}/{totalItems}
                            </span>
                            <StatusBadge status={status} />
                          </div>
                        </div>
                        {photoItems.length > 0 && (
                          <div className="flex gap-2 mt-1">
                            {photoItems.map(i => (
                              <button key={i.id} onClick={() => setViewingPhoto({ recordId: comp.id, item: i })}
                                className="flex items-center gap-1"
                                style={{ fontSize: 10, fontWeight: 800, color: unit.color, background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>
                                <Camera size={10} /> Foto
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Ticket>
            );
          })}

          {/* Ranking da equipe — penúltimo */}
          <Eyebrow>Ranking da equipe — últimos 7 dias</Eyebrow>
          {ranking7.length === 0 ? (
            <Ticket accent={C.border}>
              <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '8px 0' }}>Nenhum checklist concluído nos últimos 7 dias.</p>
            </Ticket>
          ) : (
            <Ticket accent={C.border}>
              <div className="space-y-3">
                {ranking7.map((collab, idx) => {
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                  const barColor = collab.rate >= 80 ? C.success : collab.rate >= 50 ? unit.color : C.critical;
                  const isMe = collab.name === currentUser?.name;
                  const userObj = (users || []).find(u => u.id === collab.key || u.name === collab.name);
                  const roleLabel = userObj ? ROLE_LABELS[userObj.role] : null;
                  return (
                    <div key={collab.name} style={{
                      padding: isMe ? '8px 10px' : '4px 0',
                      borderRadius: isMe ? 8 : 0,
                      background: isMe ? `${unit.color}12` : 'transparent',
                      border: isMe ? `1.5px solid ${unit.color}40` : 'none',
                    }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                          {medal
                            ? <span style={{ fontSize: 18, flexShrink: 0 }}>{medal}</span>
                            : <span className="font-mono-ibr" style={{ fontSize: 12, color: C.muted, width: 20, textAlign: 'center', flexShrink: 0 }}>{idx + 1}</span>
                          }
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: isMe ? 800 : 700, color: isMe ? unit.color : C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {collab.name}{isMe ? ' · você' : ''}
                            </p>
                            {roleLabel && (
                              <p style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{roleLabel} · {collab.done}/{collab.total} tarefas · {collab.checklists} checklist{collab.checklists !== 1 ? 's' : ''}</p>
                            )}
                            {!roleLabel && (
                              <p style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{collab.done}/{collab.total} tarefas · {collab.checklists} checklist{collab.checklists !== 1 ? 's' : ''}</p>
                            )}
                          </div>
                        </div>
                        <span className="font-display" style={{ fontSize: 16, fontWeight: 800, color: barColor, flexShrink: 0 }}>{collab.rate}%</span>
                      </div>
                      <div style={{ width: '100%', height: 5, background: C.border, borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${collab.rate}%`, background: barColor, borderRadius: 999, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Ticket>
          )}

          {/* Histórico recente — último */}
          <Eyebrow>Histórico recente</Eyebrow>
          <div className="space-y-1.5">
            {unitCompletions.length === 0
              ? <p style={{ fontSize: 13, color: C.muted }}>Nenhum checklist concluído ainda.</p>
              : [...unitCompletions].reverse().slice(0, 8).map(c => (
                <div key={c.id} className="px-3 py-2" style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 6 }}>
                  <div className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700, color: C.ink }}>{c.sector}</span>
                      <span style={{ color: C.muted }}> · {c.templateName}</span>
                    </div>
                    <span className="font-mono-ibr" style={{ color: C.muted, flexShrink: 0 }}>
                      {new Date(c.completedAt).toLocaleDateString('pt-BR')} {new Date(c.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{c.operatorName}</p>
                </div>
              ))}
          </div>
        </>
      )}

      {viewingPhoto && (
        <PhotoModal recordId={viewingPhoto.recordId} item={viewingPhoto.item} onClose={() => setViewingPhoto(null)} />
      )}

      {/* ── Notification history (gestão/gerência only) ── */}
      {canSeeAllUnits && <NotificationHistory templates={templates} last7={last7} today={today} unit={unit} />}
    </div>
  );
}

/* ── Notification History Component ── */
function NotificationHistory({ templates, last7, today, unit }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadLog = async () => {
    if (log.length > 0) return;
    setLoading(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const days = [today, ...last7];
      const keys = days.map(d => `notified_${d}`);
      const { data } = await supabase
        .from('config')
        .select('key, value, updated_at')
        .in('key', keys);

      // Build log entries
      const entries = [];
      for (const row of (data || [])) {
        const date = row.key.replace('notified_', '');
        const ids = JSON.parse(row.value || '[]');
        for (const id of ids) {
          const tpl = templates.find(t => t.id === id);
          entries.push({
            date,
            templateId: id,
            templateName: tpl?.name || 'Checklist removido',
            sector: tpl?.sector || '—',
            unitId: tpl?.unitId || '—',
            deadline: tpl?.deadline || '—',
            sentAt: row.updated_at,
          });
        }
      }
      entries.sort((a, b) => b.sentAt?.localeCompare(a.sentAt));
      setLog(entries);
    } catch (e) {
      console.warn('NotificationHistory load error:', e);
    }
    setLoading(false);
  };

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open) loadLog();
  };

  const UNIT_COLORS = { ibr1: '#1B6CA8', ibr2: '#C6842A', ibr3: '#0B3C5C' };

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={handleOpen}
        className="flex items-center justify-between w-full px-3 py-2"
        style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 10, cursor: 'pointer' }}
      >
        <div className="flex items-center gap-2">
          <Bell size={15} color={C.muted} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Histórico de notificações</span>
        </div>
        <ChevronRight size={15} color={C.muted} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div className="mt-2 space-y-2" style={{ paddingBottom: 8 }}>
          {loading && <p style={{ fontSize: 13, color: C.muted, padding: '8px 4px' }}>Carregando...</p>}
          {!loading && log.length === 0 && (
            <p style={{ fontSize: 13, color: C.muted, padding: '8px 4px' }}>Nenhuma notificação enviada nos últimos 7 dias.</p>
          )}
          {!loading && log.map((entry, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2"
              style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: UNIT_COLORS[entry.unitId] || C.muted, marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center justify-between gap-2">
                  <p style={{ fontSize: 12, fontWeight: 800, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.templateName}
                  </p>
                  <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, fontWeight: 700 }}>
                    {entry.unitId?.toUpperCase()} · {entry.deadline}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p style={{ fontSize: 11, color: C.muted }}>{entry.sector}</p>
                  <p style={{ fontSize: 10, color: C.muted }}>
                    {new Date(entry.sentAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ reports view ------------------------------- */

function StatCard({ label, value, sub, accent }) {
  return (
    <Ticket accent={accent}>
      <Eyebrow>{label}</Eyebrow>
      <p className="font-display" style={{ fontSize: 26, fontWeight: 800, color: C.ink, marginTop: 4 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</p>}
    </Ticket>
  );
}

function RateBar({ rate, accent }) {
  return (
    <div style={{ width: '100%', height: 6, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${Math.min(100, rate)}%`, background: rate >= 80 ? C.success : rate >= 50 ? accent : C.critical }} />
    </div>
  );
}

const formatDateTime = iso => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

function ReportsView({ unit, templates, completions, closures, users, canSeeAllUnits }) {
  const [period, setPeriod] = useState('7d');
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [selectedMonth, setSelectedMonth] = useState(todayStr().slice(0, 7));
  const [filterUnitId, setFilterUnitId] = useState(unit.id);

  // Keep filterUnitId in sync when the user switches loja in the header
  useEffect(() => {
    setFilterUnitId(unit.id);
    setFilterUserId('');
    setFilterSector(null);
  }, [unit.id]);
  const [filterSector, setFilterSector] = useState(null);
  const [filterShift, setFilterShift] = useState(null);
  const [filterUserId, setFilterUserId] = useState('');
  const [groupBy, setGroupBy] = useState('tipo');

  const dates = periodDates(period, customFrom, customTo, selectedMonth);
  // IBR1 uses sector groups (Salão/Cozinha); IBR2/IBR3 use individual sectors
  const sectorGroupToSectors = (groupId, unitId) => {
    if (unitId !== 'ibr1' || !groupId) return null;
    if (groupId === 'salao') return ['Salão'];
    if (groupId === 'cozinha') return ['Cozinha'];
    return null;
  };

  const resolvedSectors = sectorGroupToSectors(filterSector, filterUnitId);
  const filtered = filterCompletions(completions, {
    dates, unitId: filterUnitId,
    sector: resolvedSectors ? null : filterSector, // pass null if we handle it via sectorList
    sectorList: resolvedSectors,
    shift: filterShift, userId: filterUserId || null,
  });

  const summary = summarizeCompletions(filtered);
  const reportFilter = { unitId: filterUnitId, sector: filterSector, shift: filterShift };
  const effectiveDates = dates || [...new Set(filtered.map(c => c.date))];
  // Exclude days when the selected unit(s) were closed
  const openDates = effectiveDates.filter(d => {
    if (filterUnitId) return !isUnitClosed(closures, filterUnitId, d);
    return UNITS.some(u => !isUnitClosed(closures, u.id, d));
  });
  const expectedChecklists = openDates.reduce((sum, d) => sum + countApplicableTemplatesOnDate(templates, reportFilter, d), 0);
  const numDays = effectiveDates.length;
  const checklistRate = expectedChecklists ? (summary.checklists / expectedChecklists) * 100 : null;

  // IBR1 uses sector groups (Salão/Cozinha); IBR2/IBR3 use individual sectors
  const sectorOptions = filterUnitId === 'ibr1'
    ? [{ id: 'salao', label: 'Salão' }, { id: 'cozinha', label: 'Cozinha' }]
    : (UNITS.find(u => u.id === filterUnitId)?.sectors || []).map(s => ({ id: s, label: s }));

  const collaborators = collaboratorStats(filtered);
  const groups = groupStats(filtered, groupBy);

  // ── Export helpers ─────────────────────────────────────────────────────────
  const periodLabel = period === 'custom'
    ? `${customFrom} a ${customTo}`
    : period === 'month'
      ? new Date(`${selectedMonth}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : PERIODS.find(p => p.id === period)?.label || period;

  const exportCSV = () => {
    const rows = [
      ['Data', 'Loja', 'Setor', 'Checklist', 'Responsável', 'Concluído às', 'Tarefas feitas', 'Total tarefas', '% Conclusão', 'Críticos pendentes'],
      ...filtered.map(c => {
        const done = c.items.filter(i => i.done).length;
        const total = c.items.length;
        const rate = total ? ((done / total) * 100).toFixed(0) + '%' : '—';
        const crit = c.items.filter(i => i.critical && !i.done).length;
        return [
          c.date,
          UNITS.find(u => u.id === c.unitId)?.name || c.unitId,
          c.sector,
          c.templateName,
          c.operatorName,
          new Date(c.completedAt).toLocaleString('pt-BR'),
          done,
          total,
          rate,
          crit,
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ibr-relatorio-${periodLabel.replace(/\s/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const unitLabel = filterUnitId ? UNITS.find(u => u.id === filterUnitId)?.name : 'Todas as lojas';
    const unitColor = filterUnitId ? (UNITS.find(u => u.id === filterUnitId)?.color || '#063C5C') : '#063C5C';

    // Build bar chart SVG for groups
    const maxRate = 100;
    const barH = 24;
    const barGap = 8;
    const chartW = 480;
    const labelW = 140;
    const barMaxW = chartW - labelW - 60;
    const chartH = groups.length * (barH + barGap) + 16;

    const barsSVG = groups.map((g, i) => {
      const y = i * (barH + barGap) + 8;
      const bw = Math.round((g.rate / 100) * barMaxW);
      const color = g.rate >= 80 ? '#31C85A' : g.rate >= 50 ? unitColor : '#D1462F';
      const label = g.key.length > 22 ? g.key.slice(0, 22) + '…' : g.key;
      return `
        <text x="0" y="${y + 16}" font-size="11" fill="#4A4035" font-family="system-ui">${label}</text>
        <rect x="${labelW}" y="${y}" width="${bw}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>
        <text x="${labelW + bw + 6}" y="${y + 16}" font-size="11" font-weight="800" fill="${color}" font-family="system-ui">${g.rate.toFixed(0)}%</text>
      `;
    }).join('');

    // Collaborator rows
    const colabRows = collaborators.map(c =>
      `<tr>
        <td>${c.name}</td>
        <td style="text-align:center">${c.checklists}</td>
        <td style="text-align:center">${c.doneItems}/${c.totalItems}</td>
        <td style="text-align:center;font-weight:800;color:${c.rate>=80?'#31C85A':c.rate>=50?unitColor:'#D1462F'}">${c.rate.toFixed(0)}%</td>
        <td style="text-align:center;color:${c.criticalPending>0?'#D1462F':'#888'}">${c.criticalPending > 0 ? `⚠ ${c.criticalPending}` : '—'}</td>
      </tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>IBR Relatório — ${unitLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #063C5C; background: white; }
  .page { padding: 32px 40px; max-width: 820px; margin: 0 auto; }

  /* Header */
  .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 20px; border-bottom: 2px solid #E2EAF0; margin-bottom: 24px; }
  .header-left h1 { font-size: 20px; font-weight: 800; color: #063C5C; }
  .header-left p { font-size: 12px; color: #6B8299; margin-top: 4px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: white; background: ${unitColor}; }

  /* Summary cards */
  .cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 28px; }
  .card { border: 1.5px solid #E2EAF0; border-radius: 10px; padding: 14px 12px; }
  .card-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #6B8299; font-weight: 700; }
  .card-value { font-size: 28px; font-weight: 800; color: #063C5C; margin: 6px 0 2px; line-height: 1; }
  .card-sub { font-size: 10px; color: #6B8299; }
  .card.highlight { border-color: ${unitColor}; background: ${unitColor}10; }
  .card.highlight .card-value { color: ${unitColor}; }

  /* Section title */
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #6B8299; font-weight: 800; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid #E2EAF0; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 28px; }
  th { text-align: left; padding: 7px 10px; background: #F7F9FB; border-bottom: 2px solid #E2EAF0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B8299; font-weight: 700; }
  td { padding: 7px 10px; border-bottom: 1px solid #F0EBE0; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #F7F9FB; }

  /* Chart */
  .chart-wrap { margin-bottom: 28px; overflow: hidden; }

  /* Footer */
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2EAF0; display: flex; justify-content: space-between; font-size: 10px; color: #6B8299; }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { padding: 20px 24px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>ZCheck — Relatório Operacional</h1>
      <p>${periodLabel} &nbsp;·&nbsp; gerado em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
    <span class="badge">${unitLabel}</span>
  </div>

  <!-- Summary cards -->
  <div class="cards">
    <div class="card highlight">
      <div class="card-label">Realização geral</div>
      <div class="card-value">${summary.rate.toFixed(0)}%</div>
      <div class="card-sub">${summary.doneItems} de ${summary.totalItems} tarefas</div>
    </div>
    <div class="card">
      <div class="card-label">Checklists</div>
      <div class="card-value">${summary.checklists}${expectedChecklists > 0 ? `<span style="font-size:14px;color:#6B8299">/${expectedChecklists}</span>` : ''}</div>
      <div class="card-sub">${checklistRate != null ? checklistRate.toFixed(0) + '% do esperado' : 'concluídos'}</div>
    </div>
    <div class="card" style="${summary.criticalPending > 0 ? 'border-color:#D1462F' : ''}">
      <div class="card-label">Críticos pend.</div>
      <div class="card-value" style="color:${summary.criticalPending > 0 ? '#D1462F' : '#31C85A'}">${summary.criticalPending}</div>
      <div class="card-sub">itens críticos</div>
    </div>
    <div class="card">
      <div class="card-label">Fotos</div>
      <div class="card-value">${summary.photos}</div>
      <div class="card-sub">comprovações</div>
    </div>
  </div>

  <!-- Bar chart -->
  ${groups.length > 0 ? `
  <p class="section-title">Realização por ${groupBy === 'tipo' ? 'tipo de checklist' : 'setor'}</p>
  <div class="chart-wrap">
    <svg width="${chartW}" height="${chartH}" xmlns="http://www.w3.org/2000/svg">
      ${barsSVG}
    </svg>
  </div>` : ''}

  <!-- Collaborator table -->
  ${collaborators.length > 0 ? `
  <p class="section-title">Desempenho por colaborador</p>
  <table>
    <thead><tr>
      <th>Colaborador</th>
      <th style="text-align:center">Checklists</th>
      <th style="text-align:center">Tarefas</th>
      <th style="text-align:center">% Realização</th>
      <th style="text-align:center">Críticos pend.</th>
    </tr></thead>
    <tbody>${colabRows}</tbody>
  </table>` : ''}

  <!-- Footer -->
  <div class="footer">
    <span>ZCheck — Relatório Operacional</span>
    <span>gerado em ${new Date().toLocaleString('pt-BR')}</span>
  </div>

</div>

<script>
  // Auto-print after small delay for styles to render
  setTimeout(() => window.print(), 600);
</script>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="p-4 space-y-4">
      <Eyebrow>Período</Eyebrow>
      <div className="flex flex-wrap gap-2">
        {PERIODS.map(p => (
          <PillButton key={p.id} active={period === p.id} accent={unit.color} onClick={() => setPeriod(p.id)}>{p.label}</PillButton>
        ))}
      </div>

      {period === 'month' && (
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            max={todayStr().slice(0, 7)}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.ink, background: 'white', padding: '8px 10px', border: `1.5px solid ${unit.color}`, borderRadius: 8, outline: 'none' }}
          />
          {selectedMonth && (
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>
              {new Date(`${selectedMonth}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          )}
        </div>
      )}

      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
            style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.ink, background: 'white', padding: '8px 8px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
          />
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 800 }}>até</span>
          <input
            type="date" value={customTo} min={customFrom} max={todayStr()} onChange={e => setCustomTo(e.target.value)}
            style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.ink, background: 'white', padding: '8px 8px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
          />
        </div>
      )}

      <Eyebrow>Agrupar por</Eyebrow>
      <div className="flex gap-2">
        <PillButton active={groupBy === 'tipo'} accent={unit.color} onClick={() => setGroupBy('tipo')}>Tipo</PillButton>
        <PillButton active={groupBy === 'setor'} accent={unit.color} onClick={() => setGroupBy('setor')}>Setor</PillButton>
      </div>

      <Eyebrow>Setor</Eyebrow>
      <div className="flex flex-wrap gap-2">
        <PillButton active={!filterSector} accent={unit.color} onClick={() => setFilterSector(null)}>Todos</PillButton>
        {sectorOptions.map(s => (
          <PillButton key={s.id} active={filterSector === s.id} accent={unit.color} onClick={() => setFilterSector(s.id)}>{s.label}</PillButton>
        ))}
      </div>

      <Eyebrow>Colaborador</Eyebrow>
      <select
        value={filterUserId} onChange={e => setFilterUserId(e.target.value)}
        className="w-full"
        style={{ fontSize: 13, fontWeight: 700, color: C.ink, background: 'white', padding: '10px 10px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
      >
        <option value="">Todos</option>
        {users
          .filter(u => !u.unitId || u.unitId === filterUnitId)
          .map(u => <option key={u.id} value={u.id}>{truncName(u.name, 30)}</option>)}
      </select>

      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Checklists concluídos" accent={unit.color}
          value={expectedChecklists > 0 ? `${summary.checklists}/${expectedChecklists}` : summary.checklists}
          sub={checklistRate != null ? `${checklistRate.toFixed(0)}% do esperado no período` : `${numDays || 0} dia(s) com registros`}
        />
        <StatCard
          label="Tarefas concluídas" accent={unit.color}
          value={`${summary.rate.toFixed(0)}%`}
          sub={`${summary.doneItems} de ${summary.totalItems} itens`}
        />
        <StatCard
          label="Críticos pendentes" accent={summary.criticalPending > 0 ? C.critical : unit.color}
          value={summary.criticalPending}
          sub="itens críticos não concluídos"
        />
        <StatCard
          label="Fotos registradas" accent={unit.color}
          value={summary.photos}
          sub="comprovações com foto"
        />
      </div>

      <Eyebrow>Nível de realização por colaborador</Eyebrow>
      {collaborators.length === 0 ? (
        <EmptyState title="Sem dados no período" desc="Nenhum checklist concluído com os filtros selecionados." />
      ) : (
        <div className="space-y-2">
          {collaborators.map(c => (
            <Ticket key={c.key} accent={unit.color}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{c.name}</p>
                <p className="font-display" style={{ fontWeight: 800, color: c.rate >= 80 ? C.success : c.rate >= 50 ? unit.color : C.critical }}>{c.rate.toFixed(0)}%</p>
              </div>
              <RateBar rate={c.rate} accent={unit.color} />
              <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                {c.checklists} checklist{c.checklists > 1 ? 's' : ''} · {c.doneItems} de {c.totalItems} tarefas
                {c.criticalPending > 0 && ` · ${c.criticalPending} crítico${c.criticalPending > 1 ? 's' : ''} pendente${c.criticalPending > 1 ? 's' : ''}`}
                {c.photos > 0 && ` · ${c.photos} foto${c.photos > 1 ? 's' : ''}`}
              </p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Última atividade: {formatDateTime(c.last)}</p>
            </Ticket>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState title="Sem dados no período" desc="Nenhum checklist concluído com os filtros selecionados." />
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <Ticket key={g.key} accent={unit.color}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{g.key}</p>
                <p className="font-display" style={{ fontWeight: 800, color: g.rate >= 80 ? C.success : g.rate >= 50 ? unit.color : C.critical }}>{g.rate.toFixed(0)}%</p>
              </div>
              <RateBar rate={g.rate} accent={unit.color} />
              <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                {g.checklists} checklist{g.checklists > 1 ? 's' : ''} · {g.doneItems} de {g.totalItems} tarefas
                {g.criticalPending > 0 && ` · ${g.criticalPending} crítico${g.criticalPending > 1 ? 's' : ''} pendente${g.criticalPending > 1 ? 's' : ''}`}
              </p>
            </Ticket>
          ))}
        </div>
      )}

      {/* ── Gráfico por dia da semana ── */}
      {(() => {
        const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        // Agrupa completions por dia da semana
        const byDow = Array.from({length: 7}, () => ({ done: 0, total: 0, count: 0 }));
        filtered.forEach(c => {
          if (!c.date) return;
          const dow = new Date(c.date + 'T12:00:00').getDay();
          const items = c.items || [];
          byDow[dow].done += items.filter(i => i.done).length;
          byDow[dow].total += items.length;
          byDow[dow].count += 1;
        });
        const rates = byDow.map(d => d.total > 0 ? Math.round((d.done / d.total) * 100) : null);
        const hasData = rates.some(r => r !== null);
        if (!hasData) return null;
        const maxRate = 100;
        const barH = 80;
        return (
          <>
            <Eyebrow>Desempenho por dia da semana</Eyebrow>
            <Ticket accent={unit.color}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: barH + 36 }}>
                {DIAS.map((dia, i) => {
                  const r = rates[i];
                  const h = r !== null ? Math.max(4, Math.round((r / maxRate) * barH)) : 4;
                  const color = r === null ? C.border : r >= 80 ? C.success : r >= 50 ? unit.color : C.critical;
                  return (
                    <div key={dia} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      {r !== null && (
                        <p style={{ fontSize: 10, fontWeight: 800, color }}>{r}%</p>
                      )}
                      {r === null && (
                        <p style={{ fontSize: 9, color: C.muted }}>—</p>
                      )}
                      <div style={{ width: '100%', height: h, background: color, borderRadius: 4, opacity: r === null ? 0.3 : 1, transition: 'height 0.4s ease' }} />
                      <p style={{ fontSize: 10, fontWeight: 700, color: C.muted }}>{dia}</p>
                      {byDow[i].count > 0 && (
                        <p style={{ fontSize: 9, color: C.muted }}>{byDow[i].count}x</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
                Percentual de tarefas concluídas por dia · período selecionado · {filtered.length} registros
              </p>
            </Ticket>
          </>
        );
      })()}

      <Eyebrow>Exportar</Eyebrow>
      <div className="flex gap-2">
        <button
          onClick={exportCSV}
          className="flex-1 flex items-center justify-center gap-2 py-3"
          style={{ borderRadius: 10, border: `1.5px solid ${C.border}`, fontWeight: 800, fontSize: 13, color: C.ink, background: 'white', cursor: 'pointer' }}
        >
          ⬇ Excel / CSV
        </button>
        <button
          onClick={exportPDF}
          className="flex-1 flex items-center justify-center gap-2 py-3"
          style={{ borderRadius: 10, border: 'none', fontWeight: 800, fontSize: 13, color: 'white', background: unit.color, cursor: 'pointer', boxShadow: `0 2px 8px ${unit.color}44` }}
        >
          🖨 Exportar PDF
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- template editor ------------------------------- */

function TemplateEditor({ unit, sector, template, onSave, onCancel, checklistType, allTemplates }) {
  const [name, setName] = useState(template?.name || '');
  const [deadline, setDeadline] = useState(template?.deadline || '');
  const [items, setItems] = useState(template?.items || [{ id: uid(), text: '', critical: false, required: false, photoRequired: false }]);
  const [itemCopyTargets, setItemCopyTargets] = useState({});  // kept for future use
  const [dragState, setDragState] = useState(null); // { id, startIndex, overIndex, type }
  const dragRef = useRef(null);

  const handleDragStart = (e, id, index, type) => {
    e.preventDefault();
    const getY = ev => type === 'touch' ? ev.touches[0].clientY : ev.clientY;
    const startY = getY(e);

    // Snapshot card height once at start
    const container = document.getElementById('item-list-container');
    const firstCard = container?.children[0];
    const cardH = firstCard ? firstCard.getBoundingClientRect().height + 8 : 80; // 8 = gap

    dragRef.current = { id, startIndex: index, overIndex: index };
    setDragState({ id, startIndex: index, overIndex: index });

    const onMove = ev => {
      if (type === 'touch') ev.preventDefault();
      const dy = getY(ev) - startY;
      const shift = Math.round(dy / cardH);
      const newOver = Math.max(0, Math.min(items.length - 1, index + shift));
      if (newOver !== dragRef.current.overIndex) {
        dragRef.current.overIndex = newOver;
        setDragState(prev => prev ? { ...prev, overIndex: newOver } : null);
      }
    };

    const onEnd = () => {
      if (dragRef.current) {
        const { startIndex, overIndex } = dragRef.current;
        if (startIndex !== overIndex) {
          setItems(prev => {
            const next = [...prev];
            const [moved] = next.splice(startIndex, 1);
            next.splice(overIndex, 0, moved);
            return next;
          });
        }
      }
      dragRef.current = null;
      setDragState(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    if (type === 'touch') {
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    } else {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
    }
  };

  // Sibling templates (same praça, different type) for "copy to" feature
  const siblingTemplates = (allTemplates || []).filter(t =>
    t.unitId === unit.id &&
    t.sector === (template?.sector || sector) &&
    t.id !== template?.id &&
    t.name.split(' — ')[0] === (template?.name || '').split(' — ')[0]
  );

  // Shift: derive default from checklistType if new template
  const defaultShift = template?.shift || (
    checklistType === 'abertura' ? 'Manhã' :
    checklistType === 'fechamento' ? 'Tarde' :
    checklistType === 'intermediario' ? ['Manhã', 'Tarde'] : 'Manhã'
  );
  const [shift, setShift] = useState(defaultShift);

  const updateItem = (id, patch) => setItems(items.map(i => i.id === id ? { ...i, ...patch } : i));
  const addItem = () => setItems([...items, { id: uid(), text: '', critical: false, required: false, photoRequired: false }]);
  const removeItem = id => setItems(items.filter(i => i.id !== id));
  const moveItem = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };

  const save = () => {
    const cleanItems = items.filter(i => i.text.trim());
    if (!name.trim() || cleanItems.length === 0) return;
    onSave({
      id: template?.id, name: name.trim(), deadline: deadline || null,
      shift,
      items: cleanItems.map(i => ({ ...i, text: i.text.trim() })),
    });
  };

  return (
    <div className="p-4" style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 0px))" }}>
      <BackBar onBack={onCancel} label={template?.name?.includes(' — ') ? template.name.split(' — ')[0] : (sector || '')} accent={unit.color} />

      <div className="mb-3">
        <Ticket accent={unit.color}>
          <Eyebrow>Nome do checklist</Eyebrow>
          <input
            value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Abertura — Salão"
            className="w-full mt-1 mb-3"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: 700, color: C.ink }}
          />
          <Eyebrow>Prazo (opcional)</Eyebrow>
          <input
            type="time" value={deadline} onChange={e => setDeadline(e.target.value)}
            className="mt-1"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: 600, color: C.ink }}
          />
        </Ticket>
      </div>

      <Eyebrow>Itens do checklist</Eyebrow>
      <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Segure e arraste o <span style={{ fontWeight: 800 }}>≡</span> para reordenar. Toque no número para mover para uma posição específica.</p>
      <div className="space-y-2 mt-2" id="item-list-container">
        {dragState && (
          <div style={{
            position: 'sticky', top: 8, zIndex: 10, textAlign: 'center',
            background: unit.color, color: 'white', borderRadius: 20,
            padding: '4px 14px', fontSize: 12, fontWeight: 800,
            width: 'fit-content', margin: '0 auto 4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            → posição {dragState.overIndex + 1} de {items.length}
          </div>
        )}
        {items.map((item, index) => (
          <Ticket key={item.id} accent={item.critical ? C.critical : unit.color}
            data-item-index={index}
            style={{
              opacity: dragState?.id === item.id ? 0.35 : 1,
              outline: dragState && dragState.id !== item.id && dragState.overIndex === index
                ? `2px solid ${unit.color}` : 'none',
              outlineOffset: 2,
              transition: 'opacity 0.1s',
            }}
          >
            <div className="flex items-start gap-2">
              {/* Drag handle + position number */}
              <div className="flex flex-col items-center" style={{ flexShrink: 0, paddingTop: 2, gap: 2 }}>
                {/* Drag handle */}
                <div
                  onTouchStart={e => handleDragStart(e, item.id, index, 'touch')}
                  onMouseDown={e => handleDragStart(e, item.id, index, 'mouse')}
                  style={{ cursor: 'grab', padding: '2px 4px', touchAction: 'none', userSelect: 'none' }}
                  title="Arraste para reordenar"
                >
                  <span style={{ fontSize: 14, color: C.muted, lineHeight: 1 }}>≡</span>
                </div>
                {/* Tappable position number */}
                <button
                  onClick={() => {
                    const dest = prompt(`Mover item "${item.text.slice(0,30)}…" para qual posição? (1–${items.length})`);
                    const n = parseInt(dest);
                    if (!isNaN(n) && n >= 1 && n <= items.length && n - 1 !== index) {
                      const next = [...items];
                      const [moved] = next.splice(index, 1);
                      next.splice(n - 1, 0, moved);
                      setItems(next);
                    }
                  }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  title="Toque para mover para posição específica"
                >
                  <span className="font-mono-ibr" style={{ fontSize: 10, color: unit.color, fontWeight: 800, lineHeight: 1, textDecoration: 'underline dotted' }}>{index + 1}</span>
                </button>
              </div>
              <textarea
                value={item.text}
                onChange={e => { updateItem(item.id, { text: e.target.value }); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                placeholder="Descreva a tarefa" rows={1}
                className="flex-1"
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: C.ink, resize: 'none', overflow: 'hidden', lineHeight: 1.5 }}
              />
              <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <X size={16} color={C.muted} />
              </button>
            </div>

            {/* Orientação expandida — texto + fotos de referência + link */}
            <div className="mt-2" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 8 }}>
                Orientação — aparece no botão "Ver mais"
              </p>

              {/* Texto */}
              <textarea
                value={item.description || ''}
                onChange={e => updateItem(item.id, { description: e.target.value })}
                placeholder="Instruções detalhadas para orientar o colaborador..."
                rows={2}
                style={{ width: '100%', fontSize: 13, color: C.ink, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', outline: 'none', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit', marginBottom: 8 }}
              />

              {/* Fotos de referência */}
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Fotos de referência</p>
              <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
                {(item.refPhotos || []).map((photo, pi) => (
                  <div key={pi} style={{ position: 'relative' }}>
                    <img src={photo} alt={`ref ${pi+1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}` }} />
                    <button
                      onClick={() => updateItem(item.id, { refPhotos: (item.refPhotos || []).filter((_, i) => i !== pi) })}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: C.critical, border: 'none', color: 'white', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
                {(item.refPhotos || []).length < 5 && (
                  <label style={{ width: 72, height: 72, borderRadius: 6, border: `2px dashed ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4 }}>
                    <Camera size={18} color={C.muted} />
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>Adicionar</span>
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        e.target.value = '';
                        // Compress image to max 400px wide, quality 0.7 — keeps base64 small (~30KB)
                        const compressImage = (file) => new Promise(resolve => {
                          const img = new Image();
                          const url = URL.createObjectURL(file);
                          img.onload = () => {
                            const maxW = 400;
                            const scale = Math.min(1, maxW / img.width);
                            const canvas = document.createElement('canvas');
                            canvas.width = Math.round(img.width * scale);
                            canvas.height = Math.round(img.height * scale);
                            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                            URL.revokeObjectURL(url);
                            resolve(canvas.toDataURL('image/jpeg', 0.7));
                          };
                          img.src = url;
                        });
                        const compressed = await compressImage(file);
                        updateItem(item.id, { refPhotos: [...(item.refPhotos || []), compressed] });
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Link externo */}
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>Link externo (vídeo ou documento)</p>
              <input
                value={item.refLink || ''}
                onChange={e => updateItem(item.id, { refLink: e.target.value })}
                placeholder="https://youtube.com/... ou link de documento"
                style={{ width: '100%', fontSize: 13, color: C.ink, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              <label
                className="flex items-center gap-1.5"
                style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.critical ? C.critical : C.muted }}
              >
                <input type="checkbox" checked={!!item.critical} onChange={e => updateItem(item.id, { critical: e.target.checked })} />
                Crítico
              </label>
              <label
                className="flex items-center gap-1.5"
                style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.required ? unit.color : C.muted }}
              >
                <input type="checkbox" checked={!!item.required} onChange={e => updateItem(item.id, { required: e.target.checked })} />
                Obrigatório (bloqueia avanço)
              </label>
              <label
                className="flex items-center gap-1.5"
                style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.photoRequired ? unit.color : C.muted }}
              >
                <input type="checkbox" checked={!!item.photoRequired} onChange={e => updateItem(item.id, { photoRequired: e.target.checked })} />
                Exigir foto
              </label>
            </div>
            <div className="mt-2">
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 4 }}>
                {!item.recurrence || item.recurrence.length === 0 ? 'Todos os dias' : `Apenas: ${item.recurrence.map(d => WEEKDAY_LABELS[d]).join(', ')}`}
              </p>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((label, day) => {
                  const rec = item.recurrence || [];
                  const active = rec.includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => {
                        const next = active ? rec.filter(d => d !== day) : [...rec, day].sort();
                        updateItem(item.id, { recurrence: next.length ? next : null });
                      }}
                      style={{
                        width: 30, height: 26, borderRadius: 4, fontSize: 11, fontWeight: 800,
                        border: `1px solid ${C.border}`,
                        background: active ? unit.color : 'white',
                        color: active ? C.bg : C.muted,
                      }}
                    >
                      {label[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aparece em — define em quais tipos de checklist este item aparece */}
            {siblingTemplates.length > 0 && (() => {
              const currentType = (() => {
                const n = (template?.name || '').toLowerCase();
                if (n.includes('abertura')) return 'abertura';
                if (n.includes('fechamento')) return 'fechamento';
                if (n.includes('intermedi')) return 'intermediario';
                return null;
              })();
              const ALL_TYPES = [
                { id: 'abertura', label: 'Abertura' },
                { id: 'fechamento', label: 'Fechamento' },
                { id: 'intermediario', label: 'Intermediário' },
              ];
              // Current appearsIn — default is [currentType] meaning only here
              const appearsIn = item.appearsIn || (currentType ? [currentType] : ALL_TYPES.map(t => t.id));
              return (
                <div className="mt-2" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted, marginBottom: 6 }}>
                    Aparece em:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_TYPES.map(({ id, label }) => {
                      const active = appearsIn.includes(id);
                      return (
                        <button key={id}
                          onClick={() => {
                            const next = active
                              ? appearsIn.filter(t => t !== id)
                              : [...appearsIn, id];
                            // At least one must be selected
                            if (next.length === 0) return;
                            updateItem(item.id, { appearsIn: next });
                          }}
                          style={{
                            fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                            background: active ? unit.color : 'white',
                            color: active ? 'white' : C.muted,
                            border: `1.5px solid ${active ? unit.color : C.border}`,
                          }}>
                          {active ? '✓ ' : ''}{label}
                        </button>
                      );
                    })}
                  </div>
                  {appearsIn.length === ALL_TYPES.length && (
                    <p style={{ fontSize: 10, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>Aparece em todos os tipos</p>
                  )}
                </div>
              );
            })()}
          </Ticket>
        ))}
      </div>

      <button
        onClick={addItem}
        className="flex items-center justify-center gap-2 w-full py-2.5 mt-2"
        style={{ borderRadius: 6, border: `1px dashed ${C.border}`, fontWeight: 800, color: C.muted, background: 'none' }}
      >
        <Plus size={16} /> Adicionar item
      </button>

      <div className="fixed left-0 right-0 p-3 flex gap-2" style={{ bottom: "calc(56px + env(safe-area-inset-bottom, 0px))", background: 'rgba(250,246,239,0.96)', borderTop: `1px solid ${C.border}` }}>
        <button onClick={onCancel} className="flex-1 py-3" style={{ borderRadius: 6, border: `1px solid ${C.border}`, fontWeight: 800, color: C.ink, background: 'white' }}>
          Cancelar
        </button>
        <button onClick={save} className="font-display flex-1 py-3" style={{ borderRadius: 6, border: 'none', fontWeight: 800, color: C.bg, background: unit.color }}>
          Salvar checklist
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- gerenciar view -------------------------------- */

function GerenciarView({ unit, templates, onSaveTemplates, closures, onSaveClosures, canSeeAllUnits, checklistTypes, allUnits, onSaveUnit, onSaveSector, onSaveChecklistType, company }) {
  const [gerenciarTab, setGerenciarTab] = useState('editar'); // 'editar' | 'novo' | 'estrutura'
  const [checklistType, setChecklistType] = useState(null);
  const [sector, setSector] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showFolgas, setShowFolgas] = useState(false);

  // Novo checklist form state
  const [novoName, setNovoName] = useState('');
  const [novoType, setNovoType] = useState('');
  const [novoCustomType, setNovoCustomType] = useState('');
  const [novoUnit, setNovoUnit] = useState(unit.id);
  const [novoSector, setNovoSector] = useState('');
  const [novoDeadline, setNovoDeadline] = useState('');
  const [novoItems, setNovoItems] = useState([{ id: uid(), text: '', critical: false }]);
  const [novoSaving, setNovoSaving] = useState(false);
  const [novoSuccess, setNovoSuccess] = useState(false);

  const activeSector = sector || unit.sectors[0];
  const [saveSuccess, setSaveSuccess] = useState(false);

  // All available types — dynamic from DB + hardcoded fallback
  const availableTypes = checklistTypes?.length > 0
    ? checklistTypes
    : [
        { id: 'abertura', name: 'Abertura' },
        { id: 'intermediario', name: 'Intermediário' },
        { id: 'fechamento', name: 'Fechamento' },
      ];

  // Sectors for selected unit in Novo form
  const novoUnitObj = (allUnits || [UNITS.find(u => u.id === novoUnit)]).find(u => u.id === novoUnit) || unit;
  const novoSectorOptions = novoUnitObj?.sectors || unit.sectors;

  const handleSaveNovo = () => {
    const typeName = novoType === '__custom__' ? novoCustomType.trim() : (availableTypes.find(t => t.id === novoType)?.name || novoType);
    if (!typeName || !novoSector || novoItems.filter(i => i.text.trim()).length === 0) return;
    setNovoSaving(true);
    const cleanItems = novoItems.filter(i => i.text.trim()).map(i => ({ ...i, text: i.text.trim() }));
    const praça = novoName.trim();
    const templateName = praça ? `${praça} — ${typeName}` : typeName;
    const newTpl = {
      id: uid(), unitId: novoUnit, sector: novoSector,
      name: templateName, deadline: novoDeadline || null,
      shift: typeName.toLowerCase().includes('abertura') ? 'Manhã'
        : typeName.toLowerCase().includes('fechamento') ? 'Tarde'
        : ['Manhã', 'Tarde'],
      items: cleanItems,
    };
    onSaveTemplates([...templates, newTpl]);
    setNovoSuccess(true);
    setNovoName(''); setNovoType(''); setNovoCustomType('');
    setNovoSector(''); setNovoDeadline('');
    setNovoItems([{ id: uid(), text: '', critical: false }]);
    setNovoSaving(false);
    setTimeout(() => setNovoSuccess(false), 3000);
  };

  const handleSave = tpl => {
    const { copies, ...tplData } = tpl;
    let next;
    if (tplData.id) {
      const currentType = (() => {
        const n = (tplData.name || '').toLowerCase();
        if (n.includes('abertura')) return 'abertura';
        if (n.includes('fechamento')) return 'fechamento';
        if (n.includes('intermedi')) return 'intermediario';
        return null;
      })();
      // Normalize: remove appearsIn if it only contains current type (redundant)
      tplData.items = tplData.items.map(item => {
        if (!item.appearsIn || item.appearsIn.length === 0) return item;
        // If appearsIn only has current type, it's just "here" — keep it to signal intent
        return item;
      });
      next = templates.map(t => t.id === tplData.id ? { ...t, ...tplData } : t);
    } else {
      next = [...templates, { ...tplData, id: uid(), unitId: unit.id, sector: activeSector, shift: tplData.shift }];
    }

    // Propagate appearsIn changes to sibling templates (same praça, different type)
    if (tplData.id) {
      const currentTpl = next.find(t => t.id === tplData.id);
      const pracaPrefix = currentTpl.name.includes(' — ') ? currentTpl.name.split(' — ')[0] : null;

      if (pracaPrefix) {
        const TYPE_MAP = { 'abertura': 'abertura', 'fechamento': 'fechamento', 'intermediario': 'intermediario' };
        const getType = name => {
          const n = name.toLowerCase();
          if (n.includes('abertura')) return 'abertura';
          if (n.includes('fechamento')) return 'fechamento';
          if (n.includes('intermedi')) return 'intermediario';
          return null;
        };

        next = next.map(sibling => {
          if (sibling.id === tplData.id) return sibling; // skip self
          const siblingPraca = sibling.name.includes(' — ') ? sibling.name.split(' — ')[0] : null;
          if (siblingPraca !== pracaPrefix || sibling.sector !== currentTpl.sector) return sibling;
          const siblingType = getType(sibling.name);
          if (!siblingType) return sibling;

          let siblingItems = [...(sibling.items || [])];

          // Process each item in the saved template
          tplData.items.forEach(item => {
            const appearsIn = item.appearsIn;
            if (!appearsIn || appearsIn.length === 0) return; // no appearsIn = only in current template

            const shouldBeInSibling = appearsIn.includes(siblingType);
            const existingIdx = siblingItems.findIndex(si => si.text.trim() === item.text.trim());

            if (shouldBeInSibling && existingIdx === -1) {
              // Add to sibling — strip appearsIn from the copy (it's native there)
              const { appearsIn: _, ...itemWithoutAppearsIn } = item;
              siblingItems.push({ ...itemWithoutAppearsIn, id: uid() });
            } else if (!shouldBeInSibling && existingIdx !== -1) {
              // Remove from sibling
              siblingItems.splice(existingIdx, 1);
            }
          });

          // Also check: items that are in sibling but were removed from current template entirely
          const currentTexts = new Set(tplData.items.map(i => i.text.trim()));
          // (Items not in current template at all are left alone in sibling — they may be native there)

          return { ...sibling, items: siblingItems };
        });
      }
    }

    // Collect IDs of all modified templates
    const changedIds = [tplData.id, ...Object.keys({})].filter(Boolean);
    if (tplData.id) {
      next.forEach(t => {
        if (t.id !== tplData.id) {
          const orig = templates.find(o => o.id === t.id);
          if (orig && JSON.stringify(orig.items) !== JSON.stringify(t.items)) {
            changedIds.push(t.id);
          }
        }
      });
    }

    onSaveTemplates(next, changedIds.length ? changedIds : null);
    setEditing(null);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleDelete = async id => {
    try {
      const { supabase } = await import('../../lib/supabase');
      await supabase.from('templates').delete().eq('id', id);
    } catch(e) {}
    onSaveTemplates(templates.filter(t => t.id !== id));
  };

  if (editing) {
    return (
      <TemplateEditor
        unit={unit} sector={activeSector}
        template={editing === 'new' ? null : editing}
        checklistType={checklistType}
        allTemplates={templates}
        onSave={handleSave} onCancel={() => setEditing(null)}
      />
    );
  }

  if (showFolgas) {
    return (
      <div>
        <div className="p-4 pb-0">
          <BackBar onBack={() => setShowFolgas(false)} label="Gerenciar" accent={unit.color} />
        </div>
        <FolgasView unit={unit} closures={closures} onSaveClosures={onSaveClosures} canSeeAllUnits={canSeeAllUnits} />
      </div>
    );
  }

  // Level 3: list of templates for the selected type + sector
  if (checklistType && sector) {
    const typeConfig = CHECKLIST_TYPE_ORDER.find(c => c.key === checklistType);
    const list = templates
      .filter(t => t.unitId === unit.id && t.sector === sector && typeConfig.match(t))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    // Extract praça label same as ExecutarView
    const pracaLabel = t => t.name.includes(' — ') ? t.name.split(' — ')[0] : t.name;

    return (
      <div className="p-4 space-y-3">
        <BackBar onBack={() => setSector(null)} label={`${typeConfig.label} · ${sector}`} accent={unit.color} />
        {saveSuccess && (
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#E8F4F0', borderRadius: 8, border: `1px solid ${C.success}` }}>
            <CheckCircle2 size={16} color={C.success} />
            <p style={{ fontSize: 13, fontWeight: 700, color: C.success }}>Checklist salvo com sucesso!</p>
          </div>
        )}
        <div className="space-y-2">
          {list.map(t => (
            <Ticket key={t.id} accent={unit.color}>
              <div className="flex items-center justify-between gap-2">
                <div style={{ minWidth: 0 }}>
                  <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{pracaLabel(t)}</p>
                  <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {t.items.length} itens · {t.items.filter(i => i.critical).length} críticos{t.items.filter(i => i.photoRequired).length > 0 ? ` · ${t.items.filter(i => i.photoRequired).length} com foto` : ''}{t.deadline ? ` · até ${t.deadline}` : ''}
                  </p>
                </div>
                <div className="flex gap-2" style={{ flexShrink: 0 }}>
                  <button onClick={() => setEditing(t)} className="p-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, background: 'white' }}>
                    <Settings2 size={16} color={C.muted} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, background: 'white' }}>
                    <Trash2 size={16} color={C.critical} />
                  </button>
                </div>
              </div>
            </Ticket>
          ))}
          {list.length === 0 && (
            <EmptyState title="Sem checklists" desc={`Nenhum checklist de ${typeConfig.label} para ${sector}.`} />
          )}
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center justify-center gap-2 w-full py-3"
          style={{ borderRadius: 6, border: `2px dashed ${unit.color}`, fontWeight: 800, color: unit.color, background: 'none' }}
        >
          <Plus size={16} /> Novo checklist
        </button>
      </div>
    );
  }

  // Level 2: sectors — grouped same as Executar (Salão then Cozinha for IBR1)
  if (checklistType) {
    const typeConfig = CHECKLIST_TYPE_ORDER.find(c => c.key === checklistType);
    const isIbr1 = unit.id === 'ibr1';
    return (
      <div className="p-4 space-y-3">
        <BackBar onBack={() => setChecklistType(null)} label={typeConfig.label} accent={unit.color} />
        {isIbr1 ? (
          // IBR1: show sectors grouped (Salão / Cozinha) then praças inside
          unit.sectors.map(s => {
            const pracas = templates
              .filter(t => t.unitId === unit.id && t.sector === s && typeConfig.match(t))
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
            if (pracas.length === 0) return null;
            return (
              <div key={s}>
                <Eyebrow>{s}</Eyebrow>
                <div className="space-y-2">
                  {pracas.map(t => {
                    const label = t.name.includes(' — ') ? t.name.split(' — ')[0] : t.name;
                    return (
                      <button key={t.id} onClick={() => { setSector(s); setEditing(t); }} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                        <Ticket accent={unit.color}>
                          <div className="flex items-center justify-between gap-2">
                            <div style={{ minWidth: 0 }}>
                              <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{label}</p>
                              <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                                {t.items.length} itens · {t.items.filter(i => i.critical).length} críticos{t.deadline ? ` · até ${t.deadline}` : ''}
                              </p>
                            </div>
                            <ChevronRight size={16} color={C.muted} />
                          </div>
                        </Ticket>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          // IBR2/3: flat list of sectors
          <div className="space-y-2">
            {unit.sectors.map(s => {
              const count = templates.filter(t => t.unitId === unit.id && t.sector === s && typeConfig.match(t)).length;
              return (
                <button key={s} onClick={() => setSector(s)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                  <Ticket accent={unit.color}>
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ minWidth: 0 }}>
                        <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{s}</p>
                        <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                          {count} checklist{count !== 1 ? 's' : ''} cadastrado{count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronRight size={16} color={C.muted} />
                    </div>
                  </Ticket>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Level 1: tabbed interface
  return (
    <div style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: `1px solid ${C.border}`, background: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
        {[
          { id: 'editar', label: 'Checklists' },
          { id: 'novo', label: '+ Novo' },
          { id: 'estrutura', label: 'Estrutura' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setGerenciarTab(tab.id)}
            className="flex-1 py-3"
            style={{ background: 'none', border: 'none', fontWeight: 800, fontSize: 12,
              textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer',
              color: gerenciarTab === tab.id ? unit.color : C.muted,
              borderBottom: `2px solid ${gerenciarTab === tab.id ? unit.color : 'transparent'}`,
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ABA: EDITAR ── */}
      {gerenciarTab === 'editar' && (
        <div className="p-4 space-y-3">
          <Eyebrow>Gerenciar — {unit.name}</Eyebrow>
          <div className="space-y-2">
            {CHECKLIST_TYPE_ORDER.map(({ key, label, match }) => {
              const total = templates.filter(t => t.unitId === unit.id && match(t)).length;
              return (
                <button key={key} onClick={() => { setChecklistType(key); setSector(null); }} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                  <Ticket accent={unit.color}>
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ minWidth: 0 }}>
                        <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{label}</p>
                        <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                          {total} checklist{total !== 1 ? 's' : ''} em {unit.sectors.length} setores
                        </p>
                      </div>
                      <ChevronRight size={16} color={C.muted} />
                    </div>
                  </Ticket>
                </button>
              );
            })}
            <button onClick={() => setShowFolgas(true)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
              <Ticket accent={C.muted}>
                <div className="flex items-center justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} color={C.muted} />
                      <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>Folgas e dias fechados</p>
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {closures.filter(c => c.unitId === unit.id).length} dia{closures.filter(c => c.unitId === unit.id).length !== 1 ? 's' : ''} marcado{closures.filter(c => c.unitId === unit.id).length !== 1 ? 's' : ''} para {unit.name}
                    </p>
                  </div>
                  <ChevronRight size={16} color={C.muted} />
                </div>
              </Ticket>
            </button>
          </div>
        </div>
      )}

      {/* ── ABA: NOVO ── */}
      {gerenciarTab === 'novo' && (
        <div className="p-4 space-y-4">
          {novoSuccess && (
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#E8F4F0', borderRadius: 8, border: `1px solid ${C.success}` }}>
              <CheckCircle2 size={16} color={C.success} />
              <p style={{ fontSize: 13, fontWeight: 700, color: C.success }}>Checklist criado com sucesso!</p>
            </div>
          )}

          {/* Loja */}
          <div>
            <Eyebrow>Loja</Eyebrow>
            <div className="flex gap-2 mt-1">
              {(allUnits?.length > 0 ? allUnits : UNITS).map(u => (
                <button key={u.id} onClick={() => { setNovoUnit(u.id); setNovoSector(''); }}
                  className="flex-1 py-2"
                  style={{ borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer',
                    background: novoUnit === u.id ? u.color : 'white',
                    color: novoUnit === u.id ? 'white' : C.ink,
                    border: `1.5px solid ${novoUnit === u.id ? u.color : C.border}` }}>
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          {/* Setor */}
          <div>
            <Eyebrow>Setor</Eyebrow>
            <div className="flex flex-wrap gap-2 mt-1">
              {novoSectorOptions.map(s => (
                <button key={s} onClick={() => setNovoSector(s)}
                  style={{ borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '6px 14px',
                    background: novoSector === s ? unit.color : 'white',
                    color: novoSector === s ? 'white' : C.ink,
                    border: `1.5px solid ${novoSector === s ? unit.color : C.border}` }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo de checklist */}
          <div>
            <Eyebrow>Tipo de checklist</Eyebrow>
            <div className="flex flex-wrap gap-2 mt-1">
              {availableTypes.map(t => (
                <button key={t.id} onClick={() => setNovoType(t.id)}
                  style={{ borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '6px 14px',
                    background: novoType === t.id ? unit.color : 'white',
                    color: novoType === t.id ? 'white' : C.ink,
                    border: `1.5px solid ${novoType === t.id ? unit.color : C.border}` }}>
                  {t.name}
                </button>
              ))}
              <button onClick={() => setNovoType('__custom__')}
                style={{ borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '6px 14px',
                  background: novoType === '__custom__' ? C.ink : 'white',
                  color: novoType === '__custom__' ? 'white' : C.muted,
                  border: `1.5px solid ${novoType === '__custom__' ? C.ink : C.border}` }}>
                + Tipo livre
              </button>
            </div>
            {novoType === '__custom__' && (
              <input value={novoCustomType} onChange={e => setNovoCustomType(e.target.value)}
                placeholder="Nome do tipo (ex: Vistoria, Inventário...)"
                className="mt-2 w-full px-3 py-2"
                style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', color: C.ink }} />
            )}
          </div>

          {/* Nome da praça (opcional) */}
          <div>
            <Eyebrow>Nome da praça / subárea (opcional)</Eyebrow>
            <input value={novoName} onChange={e => setNovoName(e.target.value)}
              placeholder="Ex: Bar, Caixa, Recepção... (deixe vazio se não houver)"
              className="mt-1 w-full px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', color: C.ink }} />
          </div>

          {/* Prazo */}
          <div>
            <Eyebrow>Prazo limite (opcional)</Eyebrow>
            <input type="time" value={novoDeadline} onChange={e => setNovoDeadline(e.target.value)}
              className="mt-1 px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', color: C.ink }} />
          </div>

          {/* Itens */}
          <div>
            <Eyebrow>Itens do checklist</Eyebrow>
            <div className="space-y-2 mt-1">
              {novoItems.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2">
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, width: 20, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
                  <input value={item.text}
                    onChange={e => setNovoItems(prev => prev.map(i => i.id === item.id ? { ...i, text: e.target.value } : i))}
                    placeholder="Descreva a tarefa"
                    className="flex-1 px-3 py-2"
                    style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', color: C.ink }} />
                  <label className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 700, color: item.critical ? C.critical : C.muted, flexShrink: 0 }}>
                    <input type="checkbox" checked={!!item.critical} onChange={e => setNovoItems(prev => prev.map(i => i.id === item.id ? { ...i, critical: e.target.checked } : i))} />
                    ⚠
                  </label>
                  <button onClick={() => setNovoItems(prev => prev.filter(i => i.id !== item.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <X size={14} color={C.muted} />
                  </button>
                </div>
              ))}
              <button onClick={() => setNovoItems(prev => [...prev, { id: uid(), text: '', critical: false }])}
                className="flex items-center gap-2 w-full py-2"
                style={{ borderRadius: 8, border: `2px dashed ${C.border}`, fontWeight: 700, color: C.muted, background: 'none', fontSize: 13 }}>
                <Plus size={14} /> Adicionar item
              </button>
            </div>
          </div>

          <button onClick={handleSaveNovo} disabled={novoSaving || !novoType || !novoSector || novoItems.filter(i => i.text.trim()).length === 0}
            className="w-full py-3 font-display"
            style={{ borderRadius: 8, border: 'none', fontWeight: 800, color: 'white',
              background: (!novoType || !novoSector || novoItems.filter(i => i.text.trim()).length === 0) ? C.muted : unit.color,
              cursor: (!novoType || !novoSector) ? 'not-allowed' : 'pointer' }}>
            Criar checklist
          </button>
        </div>
      )}

      {/* ── ABA: ESTRUTURA ── */}
      {gerenciarTab === 'estrutura' && (
        <EstruturView unit={unit} allUnits={allUnits} checklistTypes={checklistTypes} company={company}
          onSaveUnit={onSaveUnit} onSaveSector={onSaveSector} onSaveChecklistType={onSaveChecklistType} />
      )}
    </div>
  );
}

/* ─────────────────── Estrutura View ─────────────────── */
function EstruturView({ unit, allUnits, checklistTypes, company, onSaveUnit, onSaveSector, onSaveChecklistType }) {
  const [tab, setTab] = useState('tipos'); // 'tipos' | 'lojas' | 'setores'
  const [newTypeName, setNewTypeName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitColor, setNewUnitColor] = useState('#063C5C');
  const [newSectorName, setNewSectorName] = useState('');
  const [newSectorUnit, setNewSectorUnit] = useState(unit.id);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 2500); };

  const addType = async () => {
    if (!newTypeName.trim()) return;
    setSaving(true);
    const t = { id: uid(), companyId: company?.id || 'ibr', name: newTypeName.trim(), sortOrder: (checklistTypes?.length || 0) + 1 };
    try { await onSaveChecklistType?.(t); flash('Tipo criado!'); setNewTypeName(''); } catch(e) { console.error(e); }
    setSaving(false);
  };

  const addUnit = async () => {
    if (!newUnitName.trim()) return;
    setSaving(true);
    const u = { id: uid(), companyId: company?.id || 'ibr', name: newUnitName.trim(), color: newUnitColor, sortOrder: (allUnits?.length || 0) + 1 };
    try { await onSaveUnit?.(u); flash('Loja criada!'); setNewUnitName(''); } catch(e) { console.error(e); }
    setSaving(false);
  };

  const addSector = async () => {
    if (!newSectorName.trim()) return;
    setSaving(true);
    const s = { id: uid(), companyId: company?.id || 'ibr', unitId: newSectorUnit, name: newSectorName.trim() };
    try { await onSaveSector?.(s); flash('Setor criado!'); setNewSectorName(''); } catch(e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div className="p-4 space-y-4">
      {success && (
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#E8F4F0', borderRadius: 8, border: `1px solid ${C.success}` }}>
          <CheckCircle2 size={16} color={C.success} />
          <p style={{ fontSize: 13, fontWeight: 700, color: C.success }}>{success}</p>
        </div>
      )}

      <div className="flex gap-2">
        {[{id:'tipos',label:'Tipos'},{id:'lojas',label:'Lojas'},{id:'setores',label:'Setores'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: '8px 4px', borderRadius: 8, fontWeight: 800, fontSize: 12,
              background: tab === t.id ? unit.color : 'white', color: tab === t.id ? 'white' : C.muted,
              border: `1.5px solid ${tab === t.id ? unit.color : C.border}`, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tipos de checklist */}
      {tab === 'tipos' && (
        <div className="space-y-3">
          <Eyebrow>Tipos de checklist</Eyebrow>
          {(checklistTypes || []).map(t => (
            <Ticket key={t.id} accent={unit.color}>
              <p style={{ fontWeight: 700, color: C.ink }}>{t.name}</p>
              {t.shift && <p style={{ fontSize: 11, color: C.muted }}>{t.shift}</p>}
            </Ticket>
          ))}
          <div className="flex gap-2">
            <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
              placeholder="Novo tipo (ex: Vistoria, Inventário...)"
              className="flex-1 px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && addType()} />
            <button onClick={addType} disabled={saving || !newTypeName.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, background: unit.color, color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Lojas */}
      {tab === 'lojas' && (
        <div className="space-y-3">
          <Eyebrow>Lojas</Eyebrow>
          {(allUnits || UNITS).map(u => (
            <Ticket key={u.id} accent={u.color}>
              <div className="flex items-center gap-2">
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: u.color, flexShrink: 0 }} />
                <p style={{ fontWeight: 700, color: C.ink }}>{u.name}</p>
              </div>
            </Ticket>
          ))}
          <div className="flex gap-2">
            <input value={newUnitName} onChange={e => setNewUnitName(e.target.value)}
              placeholder="Nome da loja"
              className="flex-1 px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && addUnit()} />
            <input type="color" value={newUnitColor} onChange={e => setNewUnitColor(e.target.value)}
              style={{ width: 42, height: 42, borderRadius: 8, border: `1.5px solid ${C.border}`, cursor: 'pointer', padding: 2 }} />
            <button onClick={addUnit} disabled={saving || !newUnitName.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, background: unit.color, color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Setores */}
      {tab === 'setores' && (
        <div className="space-y-3">
          <Eyebrow>Setores por loja</Eyebrow>
          {(allUnits || UNITS).map(u => (
            <div key={u.id}>
              <p style={{ fontSize: 11, fontWeight: 800, color: u.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{u.name}</p>
              <div className="space-y-1">
                {(u.sectors || []).map(s => (
                  <div key={s} className="px-3 py-2" style={{ background: 'white', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.ink }}>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <select value={newSectorUnit} onChange={e => setNewSectorUnit(e.target.value)}
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, padding: '8px 10px', outline: 'none', color: C.ink }}>
              {(allUnits || UNITS).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input value={newSectorName} onChange={e => setNewSectorName(e.target.value)}
              placeholder="Nome do setor"
              className="flex-1 px-3 py-2"
              style={{ fontSize: 13, borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && addSector()} />
            <button onClick={addSector} disabled={saving || !newSectorName.trim()}
              style={{ padding: '8px 16px', borderRadius: 8, background: unit.color, color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- user editor -------------------------------- */

function UserEditor({ user, onSave, onCancel }) {
  const [name, setName] = useState(user?.name || '');
  const [pin, setPin] = useState(user?.pin || '');
  const [role, setRole] = useState(user?.role || 'colaborador');
  const [unitId, setUnitId] = useState(user?.unitId ?? (UNITS[0].id));
  const [sectorId, setSectorId] = useState(user?.sectorId ?? null);
  const [suspended, setSuspended] = useState(!!user?.suspended);
  const [error, setError] = useState('');

  const needsUnit = role === 'colaborador' || role === 'lideranca' || role === 'gerencia';
  const unitObj = UNITS.find(u => u.id === unitId);
  const showSectorPicker = needsUnit && unitId === 'ibr1' && (role === 'colaborador' || role === 'lideranca');
  const sectorGroups = showSectorPicker
    ? [
        { id: null, label: 'Todos os setores', desc: 'Vê checklists de toda a loja' },
        { id: 'salao', label: 'Salão', desc: 'Salão interno, Jardim, Bar e Caixa' },
        { id: 'cozinha', label: 'Cozinha', desc: 'Brunch, Produção, Pizza e Bowls' },
      ]
    : [];

  const save = () => {
    if (!name.trim()) { setError('Informe o nome.'); return; }
    if (!user?.id && !/^\d{4}$/.test(pin)) { setError('O PIN deve ter exatamente 4 dígitos.'); return; }
    if (pin && !/^\d{4}$/.test(pin)) { setError('O PIN deve ter exatamente 4 dígitos.'); return; }
    onSave({
      id: user?.id, name: name.trim(),
      pin: pin || undefined,
      role, unitId: needsUnit ? unitId : null,
      sectorId: showSectorPicker ? sectorId : null,
      suspended,
    });
  };

  return (
    <div className="p-4" style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 0px))" }}>
      <BackBar onBack={onCancel} label="Usuários" accent={C.ink} />

      <div className="mb-3">
        <Ticket accent={suspended ? C.critical : ROLE_COLORS[role]}>
          <Eyebrow>Nome</Eyebrow>
          <input
            value={name} onChange={e => setName(e.target.value)} placeholder="Nome do usuário"
            className="w-full mt-1 mb-3"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: 700, color: C.ink }}
          />
          <Eyebrow>PIN de acesso (4 dígitos){user?.id ? ' — deixe em branco para manter o atual' : ''}</Eyebrow>
          <input
            type="tel" inputMode="numeric" maxLength={4}
            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={user?.id ? '(manter atual)' : '0000'}
            className="mt-1"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: 700, letterSpacing: '0.3em', color: C.ink }}
          />
        </Ticket>
      </div>

      <Eyebrow>Nível de acesso</Eyebrow>
      <div className="space-y-2 mt-2 mb-3">
        {ROLES.map(r => (
          <button key={r} onClick={() => setRole(r)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
            <Ticket accent={r === role ? ROLE_COLORS[r] : C.border}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-display" style={{ fontWeight: 800, color: r === role ? ROLE_COLORS[r] : C.ink }}>{ROLE_LABELS[r]}</p>
                  <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{ROLE_DESCRIPTIONS[r]}</p>
                </div>
                {r === role
                  ? <CheckCircle2 size={20} color={ROLE_COLORS[r]} />
                  : <Circle size={20} color={C.mutedLight} />}
              </div>
            </Ticket>
          </button>
        ))}
      </div>

      {needsUnit && (
        <>
          <Eyebrow>Loja vinculada</Eyebrow>
          <div className="flex gap-2 mt-2 mb-3">
            {UNITS.map(u => (
              <PillButton key={u.id} active={u.id === unitId} accent={u.color}
                onClick={() => { setUnitId(u.id); setSectorId(null); }}>{u.name}</PillButton>
            ))}
          </div>
        </>
      )}

      {showSectorPicker && (
        <>
          <Eyebrow>Setor (IBR1)</Eyebrow>
          <div className="space-y-2 mt-2 mb-3">
            {sectorGroups.map(sg => (
              <button key={String(sg.id)} onClick={() => setSectorId(sg.id)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                <Ticket accent={sectorId === sg.id ? unitObj?.color : C.border}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-display" style={{ fontWeight: 800, color: sectorId === sg.id ? unitObj?.color : C.ink }}>{sg.label}</p>
                      <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sg.desc}</p>
                    </div>
                    {sectorId === sg.id
                      ? <CheckCircle2 size={20} color={unitObj?.color} />
                      : <Circle size={20} color={C.mutedLight} />}
                  </div>
                </Ticket>
              </button>
            ))}
          </div>
        </>
      )}

      {!needsUnit && (
        <p style={{ fontSize: 12, color: C.muted }}>Este nível tem acesso a todas as lojas.</p>
      )}

      {/* Suspensão de acesso — só para usuários existentes e não-gestão */}
      {user?.id && user?.role !== 'gestao' && (
        <div style={{ marginTop: 16 }}>
          <Eyebrow>Acesso</Eyebrow>
          <button
            onClick={() => setSuspended(v => !v)}
            style={{
              width: '100%', marginTop: 8, padding: '12px 16px',
              borderRadius: 10, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
              background: suspended ? '#FFF3F0' : '#F0FAF4',
              border: `1.5px solid ${suspended ? C.critical : C.success}`,
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: suspended ? C.critical : C.success }}>
                {suspended ? '🔒 Acesso suspenso' : '✅ Acesso ativo'}
              </p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {suspended
                  ? 'Usuário não consegue fazer login. Toque para reativar.'
                  : 'Toque para suspender temporariamente o acesso.'}
              </p>
            </div>
            <div style={{
              width: 44, height: 24, borderRadius: 999,
              background: suspended ? C.critical : C.success,
              position: 'relative', flexShrink: 0, transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: 2,
                left: suspended ? 2 : 22,
                width: 20, height: 20, borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
              }} />
            </div>
          </button>
        </div>
      )}

      {error && <p style={{ fontSize: 12, fontWeight: 800, color: C.critical, marginTop: 12 }}>{error}</p>}

      <div className="fixed left-0 right-0 p-3 flex gap-2" style={{ bottom: "calc(56px + env(safe-area-inset-bottom, 0px))", background: 'rgba(250,246,239,0.96)', borderTop: `1px solid ${C.border}` }}>
        <button onClick={onCancel} className="flex-1 py-3" style={{ borderRadius: 6, border: `1px solid ${C.border}`, fontWeight: 800, color: C.ink, background: 'white' }}>
          Cancelar
        </button>
        <button onClick={save} className="font-display flex-1 py-3" style={{ borderRadius: 6, border: 'none', fontWeight: 800, color: C.bg, background: suspended ? C.critical : C.ink }}>
          Salvar usuário
        </button>
      </div>
    </div>
  );
}

function CopyLinkButton({ url }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button onClick={copy} style={{
      background: copied ? C.success : C.ink,
      color: 'white', border: 'none', borderRadius: 6,
      padding: '6px 12px', fontSize: 12, fontWeight: 800,
      cursor: 'pointer', flexShrink: 0,
      transition: 'background 0.2s',
      minWidth: 70,
    }}>
      {copied ? '✓ Copiado!' : 'Copiar'}
    </button>
  );
}

function SelfieViewer({ path }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!path) return;
    import('../../lib/supabase').then(async ({ supabase }) => {
      // Try signed URL first (works for private buckets)
      const { data, error } = await supabase.storage
        .from('colaboradores')
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) {
        setUrl(data.signedUrl);
      } else {
        // Fallback to public URL
        const { data: pub } = supabase.storage.from('colaboradores').getPublicUrl(path);
        setUrl(pub?.publicUrl || null);
        if (!pub?.publicUrl) setError(true);
      }
    });
  }, [path]);
  if (error) return <p style={{ fontSize: 12, color: C.muted }}>Selfie não disponível.</p>;
  if (!url) return <p style={{ fontSize: 12, color: C.muted }}>Carregando selfie…</p>;
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, maxWidth: 220 }}>
      <img src={url} alt="Selfie" style={{ width: '100%', display: 'block' }}
        onError={() => setError(true)} />
    </div>
  );
}

function UsersView({ users, onSaveUsers, currentUser, onGenerateTestData, generatingTestData, testDataResult }) {
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  useEffect(() => {
    let channel;
    const setup = async () => {
      const { supabase } = await import('../../lib/supabase');
      channel = supabase.channel('presence:users', { config: { presence: { key: currentUser?.id || 'anon' } } });
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const ids = new Set(Object.keys(state));
          setOnlineUsers(ids);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ user_id: currentUser?.id, online_at: new Date().toISOString() });
          }
        });
    };
    setup();
    return () => { if (channel) channel.unsubscribe(); };
  }, [currentUser?.id]);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [requests, setRequests] = useState([]);
  const [reviewingRequest, setReviewingRequest] = useState(null);
  const [editingReq, setEditingReq] = useState({});
  const [approvalRole, setApprovalRole] = useState('colaborador');
  const [approvalUnit, setApprovalUnit] = useState(null);   // string — colaborador/liderança
  const [approvalUnits, setApprovalUnits] = useState([]); // array — gerência multi-select
  const [approvalSector, setApprovalSector] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const gestaoCount = users.filter(u => u.role === 'gestao').length;

  // Load pending requests — only for gestao
  useEffect(() => {
    if (currentUser?.role !== 'gestao') return;
    const load = async () => {
      try {
        const { supabase } = await import('../../lib/supabase');
        const { data, error } = await supabase
          .from('user_requests')
          .select('*')
          .eq('status', 'pendente')
          .order('created_at', { ascending: true });
        if (error) console.warn('Requests load error:', error);
        setRequests(data || []);
      } catch (e) { console.warn('Could not load requests', e); }
    };
    load();
  }, [currentUser?.role]);

  const approveRequest = async (req) => {
    setProcessingId(req.id);
    try {
      const { supabase } = await import('../../lib/supabase');
      const isAlteracao = req.note?.startsWith('[ALTERAÇÃO DE DADOS]');

      // Merge edits into the request
      const finalName = editingReq.name ?? req.name;
      const finalPin  = editingReq.pin  ?? req.pin;
      const finalNote = editingReq.note !== undefined ? `[ALTERAÇÃO DE DADOS] ${editingReq.note}` : req.note;

      if (!isAlteracao) {
        // Create new user
        const finalUnitId = approvalRole === 'gerencia'
          ? (approvalUnits.length === 0 ? null : approvalUnits.length === 1 ? approvalUnits[0] : approvalUnits.join(','))
          : (approvalUnit || req.unit_id);

        const newUser = {
          id: uid(),
          name: finalName,
          pin: finalPin,
          role: approvalRole,
          unitId: ['gestao'].includes(approvalRole) ? null : finalUnitId,
          sectorId: approvalSector,
        };
        onSaveUsers([...users, newUser]);
      } else {
        // Apply changes to existing user
        const FIELD_MAP = {
          'Nome completo': 'name',
          'PIN de acesso': 'pin',
          'Telefone / WhatsApp': null, // not in users table
          'E-mail': null,
          'Setor / função': 'sectorId',
          'Outro': null,
        };
        const rawNote = req.note?.replace('[ALTERAÇÃO DE DADOS] ', '') || '';
        const parts = rawNote.split(' | ').filter(p => !p.startsWith('Obs:'));
        const existingUser = users.find(u => u.name === req.name);
        if (existingUser) {
          const updates = {};
          for (const part of parts) {
            const colonIdx = part.indexOf(':');
            if (colonIdx === -1) continue;
            const label = part.slice(0, colonIdx).trim();
            const fieldKey = `alt_${label}`;
            const value = editingReq[fieldKey] !== undefined
              ? editingReq[fieldKey]
              : part.slice(colonIdx + 1).trim();
            const userField = FIELD_MAP[label];
            if (userField) updates[userField] = value;
          }
          if (Object.keys(updates).length > 0) {
            onSaveUsers(users.map(u => u.id === existingUser.id ? { ...u, ...updates } : u));
          }
        }
      }

      // Update request status
      await supabase.from('user_requests').update({
        status: 'aprovado',
        name: finalName,
        pin: finalPin || req.pin,
        note: finalNote,
        role: isAlteracao ? undefined : approvalRole,
        sector_id: isAlteracao ? undefined : approvalSector,
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser.id,
      }).eq('id', req.id);

      // Send push notification to gestao/gerencia confirming action
      // and try to notify the user if they have a subscription
      try {
        const userName = users.find(u => u.name === req.name)?.id;
        if (userName) {
          const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', userName);
          if (subs?.length) {
            const msg = isAlteracao
              ? `Seus dados foram atualizados com sucesso.`
              : `Seu cadastro foi aprovado! Faça login com seu PIN.`;
            await fetch('https://rjuulamozdhssgqrzfji.supabase.co/functions/v1/notify-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json',
                Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdXVsYW1vemRoc3NncXJ6ZmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjc5MjksImV4cCI6MjA5Nzg0MzkyOX0.xxpJLp5SCpQRxMcuDMo-XD8offX2hrVUC_bU9I8me2M` },
              body: JSON.stringify({ subs, title: '✅ ZCheck', body: msg }),
            }).catch(() => {});
          }
        }
      } catch (_) {}

      setRequests(r => r.filter(x => x.id !== req.id));
      setReviewingRequest(null);
      setEditingReq({});
    } catch (e) { console.error(e); }
    setProcessingId(null);
  };

  const rejectRequest = async (req, confirmed = false) => {
    setProcessingId(req.id);
    try {
      const { supabase } = await import('../../lib/supabase');
      await supabase.from('user_requests').update({
        status: confirmed ? 'aprovado' : 'rejeitado',
        reviewed_at: new Date().toISOString(),
        reviewed_by: currentUser.id,
      }).eq('id', req.id);
      setRequests(r => r.filter(x => x.id !== req.id));
      setReviewingRequest(null);
    } catch (e) { console.error(e); }
    setProcessingId(null);
  };

  const handleSave = u => {
    let next;
    if (u.id) next = users.map(x => x.id === u.id ? { ...x, ...u } : x);
    else next = [...users, { ...u, id: uid() }];
    onSaveUsers(next);
    setEditing(null);
  };

  const handleDelete = u => {
    onSaveUsers(users.filter(x => x.id !== u.id));
    setConfirmDelete(null);
  };

  if (editing) {
    return <UserEditor user={editing === 'new' ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} />;
  }

  // Approval modal
  if (reviewingRequest) {
    const req = reviewingRequest;
    const unitObj = UNITS.find(u => u.id === req.unit_id);
    const isAlteracao = req.note?.startsWith('[ALTERAÇÃO DE DADOS]');
    const showSector = !isAlteracao && approvalRole === 'colaborador' && req.unit_id === 'ibr1';

    return (
      <div className="p-4 space-y-3" style={{ paddingBottom: "calc(100px + env(safe-area-inset-bottom, 0px))" }}>
        <BackBar onBack={() => { setReviewingRequest(null); setEditingReq({}); setApprovalUnit(null); setApprovalUnits([]); }} label="Solicitações" accent={C.ink} />

        {/* Tipo badge + cabeçalho */}
        <Ticket accent={isAlteracao ? C.ink : '#F5A623'}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontSize: 10, fontWeight: 800, color: isAlteracao ? C.ink : '#F5A623', background: isAlteracao ? `${C.ink}15` : '#F5A6231A', padding: '2px 8px', borderRadius: 20 }}>
              {isAlteracao ? '✎ Alteração de dados' : '+ Novo cadastro'}
            </span>
            <span style={{ fontSize: 11, color: C.muted }}>{new Date(req.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
          </div>
          <p className="font-display" style={{ fontWeight: 800, fontSize: 17, color: C.ink }}>{editingReq.name ?? req.name}</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{unitObj?.name || req.unit_id || '—'}</p>
        </Ticket>

        {/* Dados completos da solicitação */}
        {!isAlteracao && (
          <>
            <Eyebrow>Dados do solicitante</Eyebrow>
            <div style={{ background: 'white', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              {[
                { label: 'Nome completo', field: 'name', value: req.name },
                { label: 'CPF', field: 'cpf', value: req.cpf },
                { label: 'Telefone / WhatsApp', field: 'phone', value: req.phone },
                { label: 'E-mail', field: 'email', value: req.email },
                { label: 'PIN escolhido', field: 'pin', value: req.pin },
                { label: 'Loja', field: null, value: unitObj?.name || req.unit_id },
              ].map(({ label, field, value }, i) => (
                <div key={label} style={{ padding: '10px 14px', borderBottom: i < 5 ? `1px solid ${C.border}` : 'none' }}>
                  <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 4 }}>{label}</p>
                  {field ? (
                    <input
                      value={editingReq[field] !== undefined ? editingReq[field] : (value || '')}
                      onChange={e => setEditingReq(prev => ({ ...prev, [field]: e.target.value }))}
                      style={{ width: '100%', fontSize: 14, fontWeight: 700, color: C.ink, background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
                    />
                  ) : (
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{value || '—'}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Selfie se existir */}
            {req.selfie_path && (
              <>
                <Eyebrow>Selfie de identificação</Eyebrow>
                <SelfieViewer path={req.selfie_path} />
              </>
            )}

            {/* Nível de acesso */}
            <Eyebrow>Nível de acesso</Eyebrow>
            <div className="space-y-2">
              {ROLES.map(r => (
                <button key={r} onClick={() => { setApprovalRole(r); setApprovalSector(null); setApprovalUnits([]); }} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                  <Ticket accent={r === approvalRole ? ROLE_COLORS[r] : C.border}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-display" style={{ fontWeight: 800, color: r === approvalRole ? ROLE_COLORS[r] : C.ink }}>{ROLE_LABELS[r]}</p>
                        <p style={{ fontSize: 12, color: C.muted }}>{ROLE_DESCRIPTIONS[r]}</p>
                      </div>
                      {r === approvalRole ? <CheckCircle2 size={20} color={ROLE_COLORS[r]} /> : <Circle size={20} color={C.mutedLight} />}
                    </div>
                  </Ticket>
                </button>
              ))}
            </div>

            {/* Loja — para colaborador, liderança e gerência */}
            {['colaborador','lideranca','gerencia'].includes(approvalRole) && (
              <>
                <Eyebrow>
                  {approvalRole === 'gerencia'
                    ? 'Lojas de vinculação (pode selecionar mais de uma)'
                    : 'Loja de vinculação'}
                </Eyebrow>
                <div className="flex gap-2">
                  {UNITS.map(u => {
                    const isGerencia = approvalRole === 'gerencia';
                    const selected = isGerencia
                      ? approvalUnits.includes(u.id)
                      : approvalUnit === u.id;
                    return (
                      <button key={u.id}
                        onClick={() => {
                          if (isGerencia) {
                            // Toggle cumulative
                            setApprovalUnits(prev =>
                              prev.includes(u.id)
                                ? prev.filter(x => x !== u.id)
                                : [...prev, u.id]
                            );
                          } else {
                            setApprovalUnit(u.id);
                            setApprovalSector(null);
                          }
                        }}
                        className="flex-1 py-2"
                        style={{ borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer',
                          background: selected ? u.color : 'white',
                          color: selected ? 'white' : C.ink,
                          border: `1.5px solid ${selected ? u.color : C.border}`,
                          position: 'relative' }}>
                        {u.name}
                        {isGerencia && selected && (
                          <span style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: 'white', border: `2px solid ${u.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: u.color, fontWeight: 900 }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {approvalRole === 'gerencia' && approvalUnits.length === 0 && (
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Nenhuma loja selecionada — acesso a todas as lojas</p>
                )}
              </>
            )}

            {/* Setor — para colaborador e liderança na IBR1 */}
            {['colaborador','lideranca'].includes(approvalRole) && approvalUnit === 'ibr1' && (
              <>
                <Eyebrow>Setor</Eyebrow>
                <div className="space-y-2">
                  {[{ id: null, label: 'Todos os setores' }, { id: 'salao', label: 'Salão' }, { id: 'cozinha', label: 'Cozinha' }].map(sg => {
                    const unitColor = UNITS.find(u => u.id === 'ibr1')?.color;
                    return (
                      <button key={String(sg.id)} onClick={() => setApprovalSector(sg.id)} className="w-full text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                        <Ticket accent={approvalSector === sg.id ? unitColor : C.border}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-display" style={{ fontWeight: 800, color: approvalSector === sg.id ? unitColor : C.ink }}>{sg.label}</p>
                            {approvalSector === sg.id ? <CheckCircle2 size={20} color={unitColor} /> : <Circle size={20} color={C.mutedLight} />}
                          </div>
                        </Ticket>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* Alteração: dados solicitados editáveis — estruturado por campo */}
        {isAlteracao && (() => {
          const rawNote = req.note?.replace('[ALTERAÇÃO DE DADOS] ', '') || '';
          // Parse "Campo: Valor | Campo: Valor | Obs: ..."
          const parts = rawNote.split(' | ');
          const fields = parts
            .filter(p => !p.startsWith('Obs:'))
            .map(p => {
              const colonIdx = p.indexOf(':');
              return colonIdx > -1
                ? { label: p.slice(0, colonIdx).trim(), value: p.slice(colonIdx + 1).trim() }
                : { label: p, value: '' };
            });
          const obs = parts.find(p => p.startsWith('Obs:'))?.replace('Obs: ', '') || '';
          return (
            <>
              <Eyebrow>Dados solicitados para alteração</Eyebrow>
              <div style={{ background: 'white', borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                {fields.map(({ label, value }, i) => {
                  const fieldKey = `alt_${label}`;
                  return (
                    <div key={label} style={{ padding: '10px 14px', borderBottom: i < fields.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 4 }}>{label}</p>
                      <input
                        value={editingReq[fieldKey] !== undefined ? editingReq[fieldKey] : value}
                        onChange={e => setEditingReq(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                        style={{ width: '100%', fontSize: 14, fontWeight: 700, color: C.ink, background: 'transparent', border: 'none', outline: 'none', padding: 0 }}
                      />
                    </div>
                  );
                })}
                {obs && (
                  <div style={{ padding: '10px 14px', background: C.bg }}>
                    <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 4 }}>Observação</p>
                    <p style={{ fontSize: 13, color: C.ink }}>{obs}</p>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        {/* Botões de ação */}
        <div className="fixed left-0 right-0 p-3 flex gap-2" style={{ bottom: "calc(56px + env(safe-area-inset-bottom, 0px))", background: 'rgba(250,246,239,0.96)', borderTop: `1px solid ${C.border}` }}>
          <button onClick={() => rejectRequest(req)} disabled={!!processingId} className="flex-1 py-3"
            style={{ borderRadius: 6, border: `1px solid ${C.critical}`, fontWeight: 800, color: C.critical, background: 'white', cursor: 'pointer' }}>
            {isAlteracao ? 'Recusar' : 'Rejeitar'}
          </button>
          <button onClick={() => approveRequest(req)} disabled={!!processingId} className="flex-1 py-3"
            style={{ borderRadius: 6, border: 'none', fontWeight: 800, color: 'white', background: C.success, cursor: 'pointer' }}>
            {processingId ? 'Processando…' : isAlteracao ? 'Confirmar alteração' : 'Aprovar cadastro'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">

      {/* Solicitações — apenas Diretoria */}
      {currentUser?.role === 'gestao' && (
        <>
          <Eyebrow>Solicitações pendentes {requests.length > 0 ? `(${requests.length})` : ''}</Eyebrow>
          {requests.length === 0 ? (
            <Ticket accent={C.border}>
              <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '8px 0' }}>
                Nenhuma solicitação pendente ✓
              </p>
            </Ticket>
          ) : (
          <div className="space-y-2">
            {requests.map(req => {
              const unitObj = UNITS.find(u => u.id === req.unit_id);
              const isAlteracao = req.note?.startsWith('[ALTERAÇÃO DE DADOS]');
              return (
                <button
                  key={req.id}
                  onClick={() => { setReviewingRequest(req); setApprovalRole('colaborador'); setApprovalUnit(req.unit_id || 'ibr1'); setApprovalUnits([]); setApprovalSector(null); setEditingReq({}); }}
                  className="w-full text-left"
                  style={{ background: 'none', border: 'none', padding: 0 }}
                >
                  <Ticket accent={isAlteracao ? C.ink : '#F5A623'}>
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ minWidth: 0 }}>
                        <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{truncName(req.name)}</p>
                        <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                          {unitObj?.name || req.unit_id || '—'} · {new Date(req.created_at).toLocaleDateString('pt-BR')}
                        </p>
                        {isAlteracao && (
                          <p style={{ fontSize: 11, color: C.ink, marginTop: 3, fontStyle: 'italic' }}>
                            {req.note?.replace('[ALTERAÇÃO DE DADOS] ', '').slice(0, 60)}…
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: isAlteracao ? C.ink : '#F5A623', background: isAlteracao ? `${C.ink}15` : '#F5A6231A', padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          {isAlteracao ? '✎ Alteração' : '+ Novo cadastro'}
                        </span>
                        <ChevronRight size={16} color={C.muted} />
                      </div>
                    </div>
                  </Ticket>
                </button>
              );
            })}
          </div>
          )}
        </>
      )}

      {/* Link do app */}
      <Eyebrow>Link do app</Eyebrow>
      <Ticket accent={C.border}>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>
          Compartilhe este link com colaboradores para acessar o app:
        </p>
        <div className="flex items-center gap-2">
          <p style={{ fontSize: 13, fontWeight: 700, color: C.ink, flex: 1, wordBreak: 'break-all' }}>
            {typeof window !== 'undefined' ? window.location.origin : 'https://zcheckapp.com'}
          </p>
          <CopyLinkButton url={typeof window !== 'undefined' ? window.location.origin : 'https://zcheckapp.com'} />
        </div>
      </Ticket>

      {/* Ferramentas de gestão */}
      <Eyebrow>Ferramentas</Eyebrow>
      <div className="flex gap-2">
        <a href="/importar" style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: 'white', border: `1.5px solid ${C.border}`, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 18 }}>📥</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>Importar CSV</span>
          <span style={{ fontSize: 11, color: C.muted }}>Checklists em lote</span>
        </a>
        <a href="/onboarding" style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: 'white', border: `1.5px solid ${C.border}`, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 18 }}>🏢</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>Nova empresa</span>
          <span style={{ fontSize: 11, color: C.muted }}>Wizard de onboarding</span>
        </a>
      </div>
      {/* Users list */}
      <Eyebrow>Usuários e níveis de acesso</Eyebrow>
      <div className="space-y-2">
        {users.map(u => {
          const lastGestao = u.role === 'gestao' && gestaoCount <= 1;
          return (
            <Ticket key={u.id} accent={ROLE_COLORS[u.role]}>
              <div className="flex items-center justify-between gap-2">
                <div style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-2">
                    <p className="font-display" style={{ fontWeight: 800, color: C.ink }}>{truncName(u.name)}</p>
                    <span title={onlineUsers.has(u.id) ? 'Online' : 'Offline'} style={{ width: 8, height: 8, borderRadius: '50%', background: onlineUsers.has(u.id) ? C.success : C.border, flexShrink: 0, display: 'inline-block' }} />
                    {u.suspended && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: C.critical, background: '#FFF3F0', border: `1px solid ${C.critical}`, borderRadius: 20, padding: '1px 7px', letterSpacing: '0.04em' }}>
                        SUSPENSO
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    <span style={{ fontWeight: 800, color: ROLE_COLORS[u.role] }}>{ROLE_LABELS[u.role]}</span>
                    {' · '}{u.unitId ? UNITS.find(x => x.id === u.unitId)?.name : 'Todas as lojas'}
                    {' · PIN '}{u.pin}
                  </p>
                </div>
                <div className="flex gap-2" style={{ flexShrink: 0 }}>
                  <button onClick={() => setEditing(u)} className="p-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, background: 'white' }}>
                    <Settings2 size={16} color={C.muted} />
                  </button>
                  <button
                    onClick={() => !lastGestao && setConfirmDelete(u)}
                    disabled={lastGestao}
                    className="p-2"
                    style={{ borderRadius: 6, border: `1px solid ${C.border}`, background: 'white', opacity: lastGestao ? 0.4 : 1 }}
                  >
                    <Trash2 size={16} color={C.critical} />
                  </button>
                </div>
              </div>
              {lastGestao && <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Não é possível remover o último usuário de Diretoria.</p>}
            </Ticket>
          );
        })}
      </div>

      <button
        onClick={() => setEditing('new')}
        className="flex items-center justify-center gap-2 w-full py-3"
        style={{ borderRadius: 6, border: `2px dashed ${C.ink}`, fontWeight: 800, color: C.ink, background: 'none' }}
      >
        <Plus size={16} /> Novo usuário
      </button>

      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(32,48,43,0.5)' }}>
          <div className="w-full" style={{ maxWidth: 360, background: 'white', borderRadius: 10, padding: 16 }}>
            <p className="font-display" style={{ fontWeight: 800, color: C.ink, marginBottom: 8 }}>Remover {confirmDelete.name}?</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Essa pessoa não poderá mais acessar o app com este usuário.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2" style={{ borderRadius: 6, border: `1px solid ${C.border}`, fontWeight: 800, color: C.ink, background: 'white' }}>
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2" style={{ borderRadius: 6, border: 'none', fontWeight: 800, color: 'white', background: C.critical }}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- push modal --------------------------------- */

function PushPermissionModal({ onAllow, onDismiss }) {
  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(11,60,92,0.5)' }}
      onClick={onDismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full"
        style={{
          maxWidth: 480, background: 'white',
          borderRadius: '16px 16px 0 0',
          padding: '24px 24px 40px',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#063C5C1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bell size={24} color="#063C5C" />
          </div>
          <div>
            <p className="font-display" style={{ fontWeight: 800, fontSize: 17, color: '#063C5C' }}>Ativar notificações</p>
            <p style={{ fontSize: 13, color: '#6B8299', marginTop: 2 }}>Fique por dentro dos checklists atrasados</p>
          </div>
        </div>

        <p style={{ fontSize: 14, color: '#063C5C', lineHeight: 1.6, marginBottom: 24 }}>
          Você receberá um aviso automático no celular quando um checklist passar do horário limite sem ter sido concluído — mesmo com o app fechado.
        </p>

        <button
          onClick={onAllow}
          className="w-full py-3 mb-3"
          style={{ borderRadius: 10, background: '#063C5C', color: 'white', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer' }}
        >
          Ativar notificações
        </button>
        <button
          onClick={onDismiss}
          className="w-full py-2"
          style={{ borderRadius: 10, background: 'none', color: '#6B8299', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}
        >
          Agora não
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- folgas view -------------------------------- */

function FolgasView({ unit, closures, onSaveClosures, canSeeAllUnits }) {
  const today = todayStr();
  const [selectedUnitId, setSelectedUnitId] = useState(canSeeAllUnits ? unit.id : unit.id);
  const [month, setMonth] = useState(() => today.slice(0, 7)); // YYYY-MM

  const [year, mon] = month.split('-').map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0);
  const startWd = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  const shiftMonth = delta => {
    const d = new Date(year, mon - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const isClosed = date => closures.some(c => c.unitId === selectedUnitId && c.date === date);
  const selectedUnit = UNITS.find(u => u.id === selectedUnitId);

  const toggleDay = date => {
    let next;
    if (isClosed(date)) {
      next = closures.filter(c => !(c.unitId === selectedUnitId && c.date === date));
    } else {
      next = [...closures, { unitId: selectedUnitId, date }];
    }
    onSaveClosures(next);
  };

  const closedThisMonth = closures.filter(c =>
    c.unitId === selectedUnitId && c.date.startsWith(month)
  ).sort((a, b) => a.date.localeCompare(b.date));

  const monthLabel = new Date(year, mon - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const WD_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return (
    <div className="p-4 space-y-4">
      <Eyebrow>Dias de folga / loja fechada</Eyebrow>
      <p style={{ fontSize: 13, color: C.muted }}>
        Dias marcados são excluídos dos checklists e não contabilizados nos relatórios.
      </p>

      {canSeeAllUnits && (
        <div className="flex gap-2">
          {UNITS.map(u => (
            <PillButton key={u.id} active={selectedUnitId === u.id} accent={u.color} onClick={() => setSelectedUnitId(u.id)}>
              {u.name}
            </PillButton>
          ))}
        </div>
      )}

      {/* Month navigator */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => shiftMonth(-1)} style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <ArrowLeft size={16} color={C.ink} />
        </button>
        <p className="font-display" style={{ fontWeight: 800, fontSize: 15, color: C.ink, textTransform: 'capitalize' }}>{monthLabel}</p>
        <button onClick={() => shiftMonth(1)} style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <ChevronRight size={16} color={C.ink} />
        </button>
      </div>

      {/* Calendar grid */}
      <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {/* Weekday headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
          {WD_LABELS.map((l, i) => (
            <div key={i} style={{ padding: '6px 0', textAlign: 'center', fontSize: 11, fontWeight: 800, color: i === 0 || i === 6 ? C.critical : C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {l}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {/* Empty cells before first day */}
          {Array.from({ length: startWd }).map((_, i) => (
            <div key={`e${i}`} style={{ padding: '10px 0' }} />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${month}-${String(day).padStart(2, '0')}`;
            const closed = isClosed(dateStr);
            const isToday = dateStr === today;
            const isPast = dateStr < today;
            return (
              <button
                key={day}
                onClick={() => toggleDay(dateStr)}
                style={{
                  padding: '10px 0',
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: isToday ? 800 : 500,
                  background: closed ? `${selectedUnit.color}` : 'transparent',
                  color: closed ? 'white' : isToday ? selectedUnit.color : isPast ? C.mutedLight : C.ink,
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  borderRadius: 0,
                }}
              >
                {day}
                {isToday && !closed && (
                  <div style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: selectedUnit.color }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4" style={{ fontSize: 12, color: C.muted }}>
        <span className="flex items-center gap-1">
          <div style={{ width: 14, height: 14, borderRadius: 3, background: selectedUnit.color }} />
          Loja fechada
        </span>
        <span className="flex items-center gap-1">
          <div style={{ width: 14, height: 14, borderRadius: 3, background: C.border }} />
          Dia normal
        </span>
      </div>

      {/* List of closed days this month */}
      {closedThisMonth.length > 0 && (
        <>
          <Eyebrow>Folgas em {monthLabel} — {selectedUnit.name}</Eyebrow>
          <div className="space-y-1.5">
            {closedThisMonth.map(c => {
              const d = new Date(`${c.date}T00:00:00`);
              const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
              return (
                <div key={c.date} className="flex items-center justify-between px-3 py-2" style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, textTransform: 'capitalize' }}>{label}</span>
                  <button
                    onClick={() => toggleDay(c.date)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.critical, fontWeight: 800, fontSize: 12 }}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── UserDataChangeModal ── */
function UserDataChangeModal({ currentUser, onClose }) {
  const FIELDS = [
    { id: 'nome', label: 'Nome completo', placeholder: 'Novo nome completo', type: 'text' },
    { id: 'telefone', label: 'Telefone / WhatsApp', placeholder: '(00) 00000-0000', type: 'tel' },
    { id: 'email', label: 'E-mail', placeholder: 'seu@email.com', type: 'email' },
    { id: 'pin', label: 'PIN de acesso', placeholder: 'Novo PIN (4 dígitos)', type: 'tel' },
    { id: 'setor', label: 'Setor / função', placeholder: 'Ex: Cozinha, Salão…', type: 'text' },
    { id: 'outro', label: 'Outro', placeholder: 'Descreva a alteração…', type: 'text' },
  ];

  const [selected, setSelected] = useState(new Set());
  const [values, setValues] = useState({});
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleField = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) { setError('Selecione ao menos um campo.'); return; }
    const missing = [...selected].find(id => !values[id]?.trim());
    if (missing) { setError(`Preencha o campo "${FIELDS.find(f=>f.id===missing)?.label}".`); return; }
    setLoading(true); setError('');
    try {
      const { supabase } = await import('../../lib/supabase');
      const changes = [...selected].map(id => {
        const f = FIELDS.find(f=>f.id===id);
        return `${f.label}: ${values[id].trim()}`;
      }).join(' | ');
      await supabase.from('user_requests').insert({
        name: currentUser.name,
        unit_id: currentUser.unitId,
        status: 'pendente',
        note: `[ALTERAÇÃO DE DADOS] ${changes}${note.trim() ? ' | Obs: '+note.trim() : ''}`,
        pin: currentUser.pin || '0000',
      });
      setSent(true);
    } catch(e) { setError('Erro ao enviar. Tente novamente.'); }
    setLoading(false);
  };

  const inputStyle = { width: '100%', fontSize: 14, fontWeight: 600, padding: '12px 10px', borderRadius: 8, border: `1.5px solid ${C.border}`, outline: 'none', background: 'white', color: C.ink, fontFamily: 'inherit', marginTop: 6 };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="w-full" style={{ maxWidth: 480, background: C.bg, borderRadius: '16px 16px 0 0', maxHeight: '90vh', overflowY: 'auto', paddingBottom: 32 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2" style={{ borderBottom: `1px solid ${C.border}` }}>
          <p className="font-display" style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>Solicitar alteração de dados</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '28px 24px' }}>
            <p style={{ fontSize: 40, marginBottom: 10 }}>✅</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: C.success, marginBottom: 6 }}>Solicitação enviada!</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 1.5 }}>Sua solicitação será analisada em breve. Você será contatado quando houver retorno.</p>
            <button onClick={onClose} style={{ padding: '10px 28px', borderRadius: 8, background: C.ink, color: 'white', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              Fechar
            </button>
          </div>
        ) : (
          <div className="px-4 pt-3 space-y-4">
            <p style={{ fontSize: 12, color: C.muted }}>
              Usuário: <strong style={{ color: C.ink }}>{currentUser.name}</strong>
            </p>

            {/* Field selector */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, marginBottom: 8 }}>
                O que deseja alterar? (pode selecionar mais de um)
              </p>
              <div className="flex flex-wrap gap-2">
                {FIELDS.map(f => {
                  const on = selected.has(f.id);
                  return (
                    <button key={f.id} onClick={() => toggleField(f.id)}
                      style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 20,
                        background: on ? C.ink : 'white', color: on ? 'white' : C.ink,
                        border: `1.5px solid ${on ? C.ink : C.border}`, cursor: 'pointer' }}>
                      {on ? '✓ ' : ''}{f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic fields for selected items */}
            {[...selected].map(id => {
              const f = FIELDS.find(f=>f.id===id);
              return (
                <div key={id} style={{ background: 'white', borderRadius: 10, padding: '14px 14px 10px', border: `1.5px solid ${C.border}` }}>
                  <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>{f.label}</p>
                  <input
                    type={f.type}
                    inputMode={f.type === 'tel' ? 'numeric' : undefined}
                    value={values[id] || ''}
                    onChange={e => setValues(v => ({ ...v, [id]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={inputStyle}
                  />
                </div>
              );
            })}

            {/* Observação */}
            {selected.size > 0 && (
              <div style={{ background: 'white', borderRadius: 10, padding: '14px 14px 10px', border: `1.5px solid ${C.border}` }}>
                <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>Observação (opcional)</p>
                <textarea
                  value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Motivo ou informação adicional…"
                  rows={2}
                  style={{ ...inputStyle, resize: 'none' }}
                />
              </div>
            )}

            {error && <p style={{ fontSize: 12, color: C.critical, fontWeight: 700 }}>{error}</p>}

            <button onClick={handleSubmit} disabled={loading || selected.size === 0}
              style={{ width: '100%', padding: '13px', borderRadius: 10, background: selected.size > 0 ? C.ink : C.border, color: 'white', border: 'none', fontWeight: 800, fontSize: 14, cursor: selected.size > 0 ? 'pointer' : 'default', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Enviando…' : `Enviar solicitação${selected.size > 1 ? ` (${selected.size} campos)` : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- shell ----------------------------------- */

function Header({ unit, onSelectUnit, currentUser, canSwitchUnit, onLogout, isOnline, syncing, pendingSync, pushEnabled, onEnablePush, onDisablePush, company }) {
  const dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
  const roleColor = ROLE_COLORS[currentUser.role];
  const [showDataChange, setShowDataChange] = useState(false);
  return (
    <header className="sticky top-0 z-10" style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
      {showDataChange && (
        <UserDataChangeModal currentUser={currentUser} onClose={() => setShowDataChange(false)} />
      )}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 px-4 py-2" style={{ background: C.critical, color: 'white' }}>
          <WifiOff size={14} />
          <span style={{ fontSize: 12, fontWeight: 800 }}>Sem conexão — dados salvos localmente{pendingSync > 0 ? ` (${pendingSync} pendente${pendingSync > 1 ? 's' : ''})` : ''}</span>
        </div>
      )}
      {isOnline && syncing && (
        <div className="flex items-center justify-center gap-2 px-4 py-2" style={{ background: C.pending, color: C.ink }}>
          <RefreshCw size={14} />
          <span style={{ fontSize: 12, fontWeight: 800 }}>Sincronizando…</span>
        </div>
      )}
      {/* ── HEADER ── */}
      <div style={{
        width: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '0 16px',
        height: 64, background: '#063C5C',
        marginBottom: 0,
      }}>
        <img
          src="/zcheck-icon.png"
          alt="ZCheck"
          style={{ display: 'block', height: 40, width: 'auto', objectFit: 'contain', background: 'transparent' }}
        />
      </div>

      <div className="px-4 pt-3 pb-2">
      {/* Linha: empresa + data + usuário */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {company?.logo_url
            ? <img src={company.logo_url} alt={company.name} style={{ maxHeight: 28, maxWidth: 80, objectFit: 'contain' }} />
            : <img src={LOGO_LOGIN_URI} alt="Empresa" style={{ maxHeight: 28, maxWidth: 80, objectFit: 'contain' }} />
          }
          <p style={{ fontSize: 11, letterSpacing: '0.08em', color: C.muted, fontWeight: 600 }}>{dateLabel}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 26, height: 26, borderRadius: 999, background: `${roleColor}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={13} color={roleColor} />
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{truncName(currentUser.name, 16)}</p>
            <p style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: roleColor }}>{ROLE_LABELS[currentUser.role]}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        </div>
        <div className="flex items-center gap-3">
          {currentUser.role === 'gestao' && (
            <button
              onClick={pushEnabled ? onDisablePush : onEnablePush}
              title={pushEnabled ? 'Desativar notificações' : 'Ativar notificações'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: pushEnabled ? C.success : C.muted }}
            >
              {pushEnabled ? <Bell size={16} color={C.success} /> : <BellOff size={16} />}
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {pushEnabled ? 'Notif. ON' : 'Notif. OFF'}
              </span>
            </button>
          )}
          <button onClick={onLogout} className="flex items-center gap-1" style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
            <LogOut size={14} /> Sair
          </button>
          <button onClick={() => setShowDataChange(true)} title="Solicitar alteração de dados"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center' }}>
            <Settings2 size={15} />
          </button>
        </div>
      </div>

      {canSwitchUnit ? (
        <div className="flex gap-2">
          {UNITS.map(u => (
            <button
              key={u.id} onClick={() => onSelectUnit(u.id)}
              className="flex-1 py-2"
              style={{
                borderRadius: 6, fontSize: 14, fontWeight: 800,
                background: u.id === unit.id ? u.color : 'white',
                color: u.id === unit.id ? C.bg : u.color,
                border: `1.5px solid ${u.color}`,
              }}
            >
              {u.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2 px-3" style={{ borderRadius: 6, background: unit.color, color: C.bg }}>
          <Store size={16} />
          <span style={{ fontSize: 14, fontWeight: 800 }}>{unit.name}</span>
        </div>
      )}
      </div>
    </header>
  );
}

function BottomNav({ tab, setTab, accent, allowedTabs }) {
  const ALL_ITEMS = [
    { id: 'executar', label: 'Executar', icon: ClipboardCheck },
    { id: 'painel', label: 'Painel', icon: LayoutGrid },
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
    { id: 'gerenciar', label: 'Gerenciar', icon: Settings2 },
    { id: 'usuarios', label: 'Usuários', icon: Users },
    { id: 'id', label: 'Meu ID', icon: Award },
    { id: 'equipe', label: 'Equipe', icon: Star },
  ];
  const items = ALL_ITEMS.filter(it => allowedTabs.includes(it.id));
  if (items.length <= 1) return null;
  return (
    <nav className="sticky bottom-0 flex" style={{
      background: 'white',
      borderTop: `1px solid ${C.border}`,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {items.map(it => {
        const Icon = it.icon;
        const active = tab === it.id;
        return (
          <button
            key={it.id} onClick={() => setTab(it.id)}
            className="flex-1 flex flex-col items-center gap-1"
            style={{ background: 'none', border: 'none', padding: '10px 4px 12px', minHeight: 56 }}
          >
            <Icon size={22} color={active ? accent : C.mutedLight} />
            <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: active ? accent : C.mutedLight }}>
              {it.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100vh', background: C.bg }}>
      <p className="font-display" style={{ color: C.muted, fontWeight: 800, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Carregando…
      </p>
    </div>
  );
}

function LoginScreen({ users: initialUsers, onLogin, company: initialCompany }) {
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Use tenant users when available, fallback to initialUsers
  const users = initialUsers || [];
  const selected = users.find(u => u.id === selectedId) || null;

  const tryLogin = async value => {
    if (value.length !== 4 || !selected) return;
    setLoading(true);
    setError('');
    try {
      const { validatePin } = await import('../../lib/sync');
      const result = await validatePin(selected.id, value);
      if (result.ok) {
        if (result.user?.suspended) {
          setError('Acesso suspenso. Entre em contato com a gestão.');
          setPin('');
        } else {
          onLogin(result.user);
        }
      } else if (result.reason === 'rate_limited') {
        setError('Muitas tentativas. Aguarde 10 minutos.');
        setPin('');
      } else if (result.reason === 'wrong_pin') {
        setError('PIN incorreto. Tente novamente.');
        setPin('');
      } else if (result.reason === 'network_error') {
        setError('Sem conexão. Verifique sua internet.');
        setPin('');
      } else {
        setError('Usuário não encontrado.');
        setPin('');
      }
    } catch (e) {
      setError('Erro inesperado. Tente novamente.');
      setPin('');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col" style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        .font-display { font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 800; }
        .font-mono-ibr { font-family: ui-monospace, 'SF Mono', 'Roboto Mono', monospace; }
        * { box-sizing: border-box; }
        input, textarea, button, select { font-family: inherit; }
      `}</style>

      {/* Header ZCheck */}
      <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#063C5C', flexShrink: 0 }}>
        <a href="https://zcheckapp.com" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/zcheck-icon.png" alt="ZCheck" style={{ height: 40, width: 'auto', objectFit: 'contain', background: 'transparent' }} />
        </a>
      </div>

      <div className="flex flex-col items-center" style={{ flex: 1, justifyContent: 'center', padding: '24px 24px 80px' }}>

        {/* Logo empresa */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src={LOGO_LOGIN_URI} alt="Ilhabela Republic" style={{ width: 120, height: 'auto' }} />
        </div>

        <div className="w-full" style={{ maxWidth: 320 }}>
          <Eyebrow>Usuário</Eyebrow>
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setPin(''); setError(''); }}
            className="w-full mt-1"
            style={{ fontSize: 14, fontWeight: 700, color: C.ink, background: 'white', padding: '12px 10px',
              border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
          >
            <option value="">Selecione…</option>
            {users.filter(u => !u.suspended).map(u => (
              <option key={u.id} value={u.id}>{truncName(u.name, 30)}</option>
            ))}
          </select>

          {selected && (
            <div className="flex flex-col items-center mt-6">
              <Eyebrow>PIN de acesso</Eyebrow>
              <input
                type="tel" inputMode="numeric" autoFocus maxLength={4}
                value={pin}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(v); setError('');
                  if (v.length === 4) tryLogin(v);
                }}
                disabled={loading}
                className="text-center mt-1"
                style={{ width: 160, fontSize: 28, fontWeight: 800, letterSpacing: '0.5em', padding: '12px 0',
                  background: 'white', border: `1.5px solid ${error ? C.critical : C.border}`, borderRadius: 8, outline: 'none', color: C.ink }}
                placeholder="••••"
              />
              {loading && <p style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginTop: 8 }}>Verificando…</p>}
              {error && <p style={{ fontSize: 12, fontWeight: 800, color: C.critical, marginTop: 8 }}>{error}</p>}
            </div>
          )}
        </div>

        {/* Links */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Não tem cadastro?</p>
          <a href="/cadastro"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800,
              color: '#063C5C', padding: '10px 20px', borderRadius: 8, border: '1.5px solid #E2EAF0',
              background: 'white', textDecoration: 'none' }}>
            Solicitar acesso →
          </a>
          <div style={{ marginTop: 12 }}>
            <a href="/cadastro?status=1"
              style={{ fontSize: 12, fontWeight: 700, color: '#6B8299', textDecoration: 'underline' }}>
              Verificar status de solicitação
            </a>
          </div>
        </div>

        <InstallPrompt />
      </div>
    </div>
  );
}


function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detecta iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIos(ios);
    // Detecta se já está instalado como PWA
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    setIsStandalone(standalone);
    // Android: captura o evento beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Já está instalado ou rodando como PWA — não mostra nada
  if (isStandalone || installed) return null;

  const handleInstall = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallEvent(null);
  };

  // Android com prompt disponível
  if (installEvent) return (
    <div style={{ marginTop: 20, textAlign: 'center' }}>
      <button
        onClick={handleInstall}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 13, fontWeight: 800, color: 'white',
          padding: '10px 20px', borderRadius: 8, border: 'none',
          background: '#063C5C', cursor: 'pointer',
        }}
      >
        📲 Instalar app na tela inicial
      </button>
    </div>
  );

  // iOS — mostra guia
  if (isIos) return (
    <div style={{ marginTop: 20, textAlign: 'center' }}>
      <button
        onClick={() => setShowIosGuide(v => !v)}
        style={{
          fontSize: 12, fontWeight: 700, color: C.muted,
          background: 'none', border: 'none', cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        📲 Adicionar à tela inicial
      </button>
      {showIosGuide && (
        <div style={{
          marginTop: 10, padding: '12px 16px', borderRadius: 10,
          background: 'white', border: '1.5px solid #E2EAF0',
          textAlign: 'left', maxWidth: 280, margin: '10px auto 0',
        }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#063C5C', marginBottom: 8 }}>
            Como instalar no iPhone / iPad:
          </p>
          <ol style={{ fontSize: 12, color: '#555', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
            <li>Toque no botão <strong>Compartilhar</strong> <span style={{ fontSize: 14 }}>⎋</span> no Safari</li>
            <li>Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong></li>
            <li>Confirme tocando em <strong>"Adicionar"</strong></li>
          </ol>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            O app aparecerá na sua tela inicial como qualquer outro app.
          </p>
        </div>
      )}
    </div>
  );

  return null;
}

/* ── WelcomeScreen ── */
function WelcomeScreen({ role, onClose }) {
  const isLider = role === 'lideranca';
  const [step, setStep] = useState(0);

  const colaboradorSteps = [
    { icon: '🔐', title: 'Faça login', desc: 'Selecione seu nome na lista e digite seu PIN de 4 dígitos.' },
    { icon: '📋', title: 'Abra Executar', desc: 'Na aba Executar, veja os checklists do seu setor e turno de hoje.' },
    { icon: '☑️', title: 'Marque os itens', desc: 'Toque em cada item para marcar como concluído. Itens críticos aparecem destacados — priorize-os.' },
    { icon: '📸', title: 'Tire fotos', desc: 'Itens com câmera exigem foto como comprovação. Toque no ícone 📷 e registre.' },
    { icon: '✅', title: 'Conclua o checklist', desc: 'Quando todos os itens estiverem marcados, toque em "Concluir" para registrar.' },
    { icon: '🏆', title: 'Veja seu Painel', desc: 'Na aba Painel, acompanhe seu score e compare com a equipe.' },
  ];

  const liderSteps = [
    { icon: '📈', title: 'Relatórios', desc: 'Acesse a aba Relatórios para ver o desempenho da equipe por período, setor e colaborador. Exporte em PDF ou CSV.' },
    { icon: '📊', title: 'Painel', desc: 'Acompanhe o score diário, ranking da equipe e o comparativo entre lojas com tendência dos últimos 7 dias.' },
    { icon: '☑️', title: 'Executar', desc: 'Você também pode executar checklists e ver o progresso de todos os setores da sua loja.' },
    { icon: '📅', title: 'Filtros de período', desc: 'Nos relatórios, filtre por dia, semana, mês completo ou período personalizado.' },
    { icon: '👥', title: 'Ranking de equipe', desc: 'Veja quem está se destacando no Painel — ranking por % de realização nos últimos 7 dias.' },
    { icon: '⚙️', title: 'Solicitar alterações', desc: 'Use o ícone ⚙️ no cabeçalho para solicitar alteração dos seus dados cadastrais.' },
  ];

  const steps = isLider ? liderSteps : colaboradorSteps;
  const isLast = step === steps.length - 1;

  const tips = isLider ? [
    { icon: '📶', text: 'Funciona offline. Sincroniza quando voltar a internet.' },
    { icon: '🔔', text: 'Ative as notificações para alertas de checklists atrasados.' },
    { icon: '📱', text: 'Adicione à tela inicial para acesso rápido como app.' },
  ] : [
    { icon: '📶', text: 'Funciona offline. Sincroniza quando voltar a internet.' },
    { icon: '🔔', text: 'Ative as notificações para receber alertas de atraso.' },
    { icon: '📱', text: 'Adicione à tela inicial para acesso rápido como app.' },
    { icon: '⚠️', text: 'Não compartilhe seu PIN com ninguém.' },
  ];

  const accentColor = isLider ? '#35577A' : '#2F6F5E';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(11,60,92,0.92)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 380, background: C.bg,
        borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ background: accentColor, padding: '20px 24px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
            Bem-vindo ao ZCheck
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>
            {isLider ? 'Guia de Liderança' : 'Guia do Colaborador'}
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', padding: '12px 24px 0' }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 999,
              background: i <= step ? accentColor : C.border,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <p style={{ fontSize: 48, marginBottom: 10 }}>{steps[step].icon}</p>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentColor, marginBottom: 6 }}>
              Passo {step + 1} de {steps.length}
            </p>
            <p className="font-display" style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 8 }}>
              {steps[step].title}
            </p>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
              {steps[step].desc}
            </p>
          </div>

          {/* Tips on last step */}
          {isLast && (
            <div style={{ background: 'white', borderRadius: 12, padding: 14, marginBottom: 8, border: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, marginBottom: 10 }}>
                Dicas importantes
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tips.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{t.icon}</span>
                    <p style={{ fontSize: 12, color: '#555', lineHeight: 1.4 }}>{t.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1.5px solid ${C.border}`, background: 'white', fontWeight: 800, fontSize: 13, color: C.ink, cursor: 'pointer' }}>
                ← Anterior
              </button>
            )}
            <button
              onClick={() => isLast ? onClose() : setStep(s => s + 1)}
              style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: accentColor, color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
            >
              {isLast ? '🚀 Começar!' : 'Próximo →'}
            </button>
          </div>

          {!isLast && (
            <button onClick={onClose}
              style={{ width: '100%', marginTop: 10, padding: '8px', background: 'none', border: 'none', fontSize: 12, color: C.muted, cursor: 'pointer', fontWeight: 700 }}>
              Pular introdução
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error('[ErrorBoundary]', e.message, info?.componentStack?.slice(0, 200)); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#F7F9FB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui' }}>
          <p style={{ fontSize: 32, marginBottom: 16 }}>⚠️</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#063C5C', marginBottom: 8 }}>Algo deu errado</p>
          <p style={{ fontSize: 12, color: '#6B8299', textAlign: 'center', maxWidth: 340, marginBottom: 8, fontFamily: 'monospace', background: '#fff', padding: 8, borderRadius: 6 }}>
            {this.state.error?.message}
          </p>
          <button onClick={() => window.location.reload()}
            style={{ padding: '12px 24px', borderRadius: 8, background: '#063C5C', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------ Daily Briefing (H1) ------------------------------ */
// Deriva o briefing operacional 100% dos dados existentes (completions + templates + closures).
// Escopo: uma loja (líder) ou todas (gerência/gestão, scopeUnitId = null).
function buildBriefing(completions, templates, closures, units, scopeUnitId) {
  const today = todayStr();
  const yStr = yesterdayStr();
  const unitIds = scopeUnitId ? [scopeUnitId] : units.map(u => u.id);
  const unitName = id => units.find(u => u.id === id)?.name || id;

  // Mapa itemId → texto, para nomear itens críticos nas recomendações.
  const itemText = new Map();
  templates.forEach(t => (t.items || []).forEach(i => { if (!itemText.has(i.id)) itemText.set(i.id, i.text); }));

  const scopeFilter = dates => (scopeUnitId ? { dates, unitId: scopeUnitId } : { dates });

  // ── Ontem ──
  const yFiltered = filterCompletions(completions, scopeFilter([yStr]));
  const ySummary = summarizeCompletions(yFiltered);
  let yExpected = 0;
  unitIds.forEach(uid => { if (!isUnitClosed(closures, uid, yStr)) yExpected += countApplicableTemplatesOnDate(templates, { unitId: uid }, yStr); });
  const yAdherence = yExpected ? Math.round((yFiltered.length / yExpected) * 100) : null;

  // ── Hoje ──
  let tExpected = 0;
  unitIds.forEach(uid => { if (!isUnitClosed(closures, uid, today)) tExpected += countApplicableTemplatesOnDate(templates, { unitId: uid }, today); });
  const tDone = filterCompletions(completions, scopeFilter([today])).length;
  const scopeTemplates = templates.filter(t =>
    (!scopeUnitId || t.unitId === scopeUnitId) &&
    !isUnitClosed(closures, t.unitId, today) &&
    applicableItems(t, today).length > 0);
  const overdue = scopeTemplates.filter(t => templateStatus(t, completions, today) === 'overdue');

  // ── Recomendações (rule-based; IA generativa fica para depois — §16) ──
  const recs = [];

  // 1. Itens críticos que ficaram pendentes ≥2× nos últimos 7 dias.
  const last7 = [];
  for (let i = 1; i <= 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); last7.push(d.toISOString().slice(0, 10)); }
  const f7 = filterCompletions(completions, scopeUnitId ? { dates: last7, unitId: scopeUnitId } : { dates: last7 });
  const hotspot = new Map();
  f7.forEach(c => (c.items || []).forEach(i => {
    if (i.critical && !i.done) { const k = `${c.unitId}|${i.id}`; hotspot.set(k, (hotspot.get(k) || 0) + 1); }
  }));
  [...hotspot.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(([k, n]) => {
    const [uid, iid] = k.split('|');
    recs.push({
      id: `hotspot_${k}`, type: 'critical_hotspot', icon: '⚠️',
      text: `${unitName(uid)}: "${truncName(itemText.get(iid) || 'item crítico', 40)}" ficou pendente ${n}× nos últimos 7 dias. Priorize hoje.`,
      unitId: uid, tab: 'painel',
    });
  });

  // 2. Checklists atrasados agora.
  if (overdue.length > 0) {
    const u0 = overdue[0];
    recs.push({
      id: 'overdue_today', type: 'overdue_today', icon: '⏰',
      text: overdue.length === 1
        ? `"${truncName(u0.name, 36)}" está atrasado em ${unitName(u0.unitId)}.`
        : `${overdue.length} checklists estão atrasados agora. Acompanhe as equipes.`,
      unitId: scopeUnitId ? null : u0.unitId, tab: 'painel',
    });
  }

  // 3. Loja com pior aderência ontem (só na visão multi-loja).
  if (!scopeUnitId && yFiltered.length > 0) {
    const worst = groupStats(yFiltered, 'loja').filter(g => g.checklists > 0).sort((a, b) => a.rate - b.rate)[0];
    if (worst && worst.rate < 80) {
      recs.push({
        id: 'low_adherence', type: 'low_adherence', icon: '📉',
        text: `${worst.key} fechou ontem com ${Math.round(worst.rate)}% de conclusão. Reforce a rotina hoje.`,
        tab: 'relatorios',
      });
    }
  }

  // Fallback positivo — nunca deixar o briefing vazio.
  if (recs.length === 0) {
    recs.push({
      id: 'all_good', type: 'all_good', icon: '✅',
      text: yAdherence != null && yAdherence >= 90
        ? `Ontem fechou com ${yAdherence}% de aderência. Mantenha o ritmo hoje.`
        : 'Sem alertas críticos. Comece o dia acompanhando as aberturas.',
      tab: 'painel',
    });
  }

  // ── Insight do dia (H4) ────────────────────────────────────────────────────
  // Análise automática que conecta pontos que um humano teria que garimpar:
  // tendência, falha crítica recorrente ou loja destoante. Hoje é rule-based;
  // o contrato de eventos é o mesmo se depois virar LLM (§16 da revisão).
  const insight = buildInsight({ completions, unitIds, scopeUnitId, unitName, itemText, hotspot, yFiltered, yAdherence });

  return {
    date: today,
    yesterday: { adherence: yAdherence, checklists: yFiltered.length, expected: yExpected, rate: Math.round(ySummary.rate), criticalPending: ySummary.criticalPending },
    today: { expected: tExpected, done: tDone, pending: Math.max(0, tExpected - tDone), overdue: overdue.length },
    recommendations: recs.slice(0, 3),
    insight,
  };
}

// Motor de insight (H4) — escolhe o padrão MAIS relevante dos dados recentes.
// Prioridade: queda de tendência > falha crítica recorrente > loja destoante > estável.
function buildInsight({ completions, unitIds, scopeUnitId, unitName, itemText, hotspot, yFiltered, yAdherence }) {
  const today = todayStr();
  const wkThis = weekStartStr(today);
  const dPrev = new Date(); dPrev.setDate(dPrev.getDate() - 7);
  const wkPrev = weekStartStr(dPrev.toISOString().slice(0, 10));

  // Últimos 14 dias no escopo, agrupados por unidade × semana (item-level).
  const dates14 = [];
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() - i); dates14.push(d.toISOString().slice(0, 10)); }
  const f14 = filterCompletions(completions, scopeUnitId ? { dates: dates14, unitId: scopeUnitId } : { dates: dates14 });
  const perUnitWk = {};
  f14.forEach(c => {
    const wk = weekStartStr(c.date);
    if (wk !== wkThis && wk !== wkPrev) return;
    perUnitWk[c.unitId] = perUnitWk[c.unitId] || {};
    const slot = (perUnitWk[c.unitId][wk] = perUnitWk[c.unitId][wk] || { total: 0, done: 0 });
    (c.items || []).forEach(i => { slot.total++; if (i.done) slot.done++; });
  });

  // 1. Maior queda de tendência semana-a-semana (≥15 p.p., base mínima de 5 itens).
  let worstDrop = null;
  Object.entries(perUnitWk).forEach(([u, wks]) => {
    const t = wks[wkThis], p = wks[wkPrev];
    if (t && p && t.total >= 5 && p.total >= 5) {
      const rt = Math.round((t.done / t.total) * 100);
      const rp = Math.round((p.done / p.total) * 100);
      const drop = rp - rt;
      if (drop >= 15 && (!worstDrop || drop > worstDrop.drop)) worstDrop = { unitId: u, rt, rp, drop };
    }
  });
  if (worstDrop) {
    return {
      id: `trend_${worstDrop.unitId}`, type: 'trend_decline', icon: '📉',
      headline: `${unitName(worstDrop.unitId)} está caindo de rendimento`,
      evidence: `A conclusão passou de ${worstDrop.rp}% na semana passada para ${worstDrop.rt}% esta semana (−${worstDrop.drop} p.p.). Vale entender o que mudou na operação e agir hoje, antes de virar hábito.`,
      unitId: worstDrop.unitId,
    };
  }

  // 2. Falha crítica recorrente (≥3× em 7 dias).
  let topHot = null;
  [...hotspot.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    if (!topHot && n >= 3) { const [u, iid] = k.split('|'); topHot = { unitId: u, iid, n }; }
  });
  if (topHot) {
    return {
      id: `crit_${topHot.unitId}_${topHot.iid}`, type: 'recurring_critical', icon: '🔁',
      headline: `Falha crítica que se repete em ${unitName(topHot.unitId)}`,
      evidence: `"${truncName(itemText.get(topHot.iid) || 'item crítico', 44)}" ficou pendente ${topHot.n}× nos últimos 7 dias. É um risco recorrente — ataque a causa, não só a tarefa do dia.`,
      unitId: topHot.unitId,
    };
  }

  // 3. Loja destoante ontem (diferença ≥25 p.p. entre melhor e pior).
  if (!scopeUnitId && yFiltered.length > 0) {
    const groups = groupStats(yFiltered, 'loja').filter(g => g.checklists > 0);
    const worst = [...groups].sort((a, b) => a.rate - b.rate)[0];
    const best = [...groups].sort((a, b) => b.rate - a.rate)[0];
    if (worst && best && best.rate - worst.rate >= 25) {
      return {
        id: `outlier_${worst.key}`, type: 'sector_outlier', icon: '⚖️',
        headline: `${worst.key} destoa das outras lojas`,
        evidence: `Ontem ${worst.key} fechou com ${Math.round(worst.rate)}% enquanto ${best.key} fez ${Math.round(best.rate)}%. A diferença sugere um problema local, não geral — olhe o que a ${best.key} faz diferente.`,
      };
    }
  }

  // 4. Baixa atividade / estável / dados insuficientes.
  const lowActivity = yAdherence != null && yAdherence < 50;
  return {
    id: lowActivity ? 'low_activity' : 'stable',
    type: lowActivity ? 'low_activity' : 'stable',
    icon: lowActivity ? '⚠️' : '🧭',
    headline: yAdherence != null && yAdherence >= 85
      ? 'Operação saudável e estável'
      : lowActivity ? 'Baixa atividade registrada ontem' : 'Sem padrões críticos hoje',
    evidence: yAdherence == null
      ? 'Ainda não há dados suficientes para uma análise mais profunda. Conforme a rotina roda, os insights ficam mais precisos.'
      : lowActivity
        ? `Só ${yAdherence}% dos checklists previstos foram concluídos ontem. Confirme se as equipes estão registrando a rotina no app — sem dado, não há como acompanhar a operação.`
        : `A aderência de ontem (${yAdherence}%) está dentro do esperado. Bom momento para reforçar o que está funcionando.`,
  };
}

function DailyBriefing({ briefing, currentUser, accent, openSource, onClose, onNavigate }) {
  const startRef = useRef(Date.now());
  const [actioned, setActioned] = useState({});
  const [survey, setSurvey] = useState(null);
  const [insightFeedback, setInsightFeedback] = useState(null);
  const [insightActioned, setInsightActioned] = useState(false);
  const insight = briefing.insight;

  // Instrumentação de abertura + tempo em tela (dwell consolidado em 1 evento — §8).
  useEffect(() => {
    track('briefing_opened', { source: openSource, metadata: { recommendations: briefing.recommendations.length } });
    if (insight) track('ai_insight_viewed', { source: 'briefing', unitId: insight.unitId || undefined, metadata: { insight_id: insight.id, type: insight.type } });
    const start = startRef.current;
    return () => {
      track('briefing_dwell', { source: openSource, metadata: { seconds: Math.round((Date.now() - start) / 1000) } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rateInsight = ans => {
    if (insightFeedback || !insight) return;
    setInsightFeedback(ans);
    track('ai_insight_feedback', { source: 'briefing', unitId: insight.unitId || undefined, metadata: { insight_id: insight.id, type: insight.type, answer: ans } });
  };
  const actOnInsight = () => {
    if (!insight) return;
    if (!insightActioned) {
      setInsightActioned(true);
      track('ai_insight_actioned', { source: 'briefing', unitId: insight.unitId || undefined, metadata: { insight_id: insight.id, type: insight.type } });
    }
    if (insight.unitId) onNavigate(insight.unitId, 'painel');
  };

  const clickRec = rec => {
    track('recommendation_clicked', { source: 'briefing', unitId: rec.unitId || undefined, metadata: { rec_id: rec.id, type: rec.type } });
    if (rec.tab || rec.unitId) onNavigate(rec.unitId, rec.tab);
  };
  const actionRec = (rec, e) => {
    e.stopPropagation();
    if (actioned[rec.id]) return;
    setActioned(a => ({ ...a, [rec.id]: true }));
    track('recommendation_actioned', { source: 'briefing', unitId: rec.unitId || undefined, metadata: { rec_id: rec.id, type: rec.type } });
  };
  const answerSurvey = ans => {
    if (survey) return;
    setSurvey(ans);
    track('survey_answered', { source: 'briefing', metadata: { question: 'briefing_helped_prioritize', answer: ans } });
  };

  const y = briefing.yesterday, t = briefing.today;
  const dateLabel = new Date(`${briefing.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = (currentUser?.name || '').split(' ')[0];

  const Stat = ({ label, value, sub, color }) => (
    <div style={{ flex: 1, textAlign: 'center', padding: '10px 6px' }}>
      <p style={{ fontSize: 26, fontWeight: 800, color: color || C.ink, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 11, color: C.muted, marginTop: 4, fontWeight: 700 }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: C.mutedLight, marginTop: 2 }}>{sub}</p>}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,60,92,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', background: C.bg, borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.3)', paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>
        {/* Cabeçalho */}
        <div style={{ background: accent, color: 'white', padding: '20px 20px 18px', borderRadius: '20px 20px 0 0', position: 'relative' }}>
          <button onClick={onClose} aria-label="Fechar" style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white', borderRadius: 999, width: 30, height: 30, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>☀️ Briefing do dia</p>
          <p className="font-display" style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{greeting}{firstName ? `, ${firstName}` : ''}</p>
          <p style={{ fontSize: 12, opacity: 0.85, marginTop: 2, textTransform: 'capitalize' }}>{dateLabel}</p>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Insight do dia (H4) — análise automática no topo do briefing */}
          {insight && (
            <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${accent}40`, borderLeft: `4px solid ${accent}`, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{insight.icon || '🧠'}</span>
                <p style={{ fontSize: 10.5, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.1em' }}>🧠 Análise do dia</p>
              </div>
              <p className="font-display" style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 5 }}>{insight.headline}</p>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>{insight.evidence}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {insight.unitId && (
                  <button onClick={actOnInsight}
                    style={{ padding: '8px 14px', borderRadius: 9, background: insightActioned ? `${C.success}18` : accent, color: insightActioned ? C.success : 'white', border: 'none', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                    {insightActioned ? '✓ Vou agir nisso' : 'Agir sobre isso →'}
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  {insightFeedback ? (
                    <span style={{ fontSize: 11.5, color: C.success, fontWeight: 700 }}>Valeu pelo retorno!</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 11.5, color: C.mutedLight, fontWeight: 700 }}>Foi útil?</span>
                      <button onClick={() => rateInsight('yes')} style={{ padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 14, cursor: 'pointer' }}>👍</button>
                      <button onClick={() => rateInsight('no')} style={{ padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 14, cursor: 'pointer' }}>👎</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ontem */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: '6px 8px' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 8px 2px' }}>Ontem</p>
            <div style={{ display: 'flex' }}>
              <Stat label="Aderência" value={y.adherence != null ? `${y.adherence}%` : '—'} color={y.adherence == null ? C.mutedLight : y.adherence >= 80 ? C.success : C.critical} />
              <Stat label="Checklists" value={`${y.checklists}${y.expected ? `/${y.expected}` : ''}`} />
              <Stat label="Críticos pend." value={y.criticalPending} color={y.criticalPending > 0 ? C.critical : C.ink} />
            </div>
          </div>

          {/* Hoje */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: '6px 8px' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 8px 2px' }}>Hoje</p>
            <div style={{ display: 'flex' }}>
              <Stat label="Previstos" value={t.expected} />
              <Stat label="Concluídos" value={t.done} color={C.success} />
              <Stat label="Pendentes" value={t.pending} />
              <Stat label="Atrasados" value={t.overdue} color={t.overdue > 0 ? C.critical : C.ink} />
            </div>
          </div>

          {/* Recomendações */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 2 }}>Prioridades de hoje</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {briefing.recommendations.map(rec => (
                <div key={rec.id} onClick={() => clickRec(rec)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 12px', cursor: rec.tab || rec.unitId ? 'pointer' : 'default' }}>
                  <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.3 }}>{rec.icon}</span>
                  <p style={{ flex: 1, fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{rec.text}</p>
                  {rec.type !== 'all_good' && (
                    <button onClick={e => actionRec(rec, e)}
                      style={{ flexShrink: 0, alignSelf: 'center', padding: '5px 10px', borderRadius: 8, border: `1px solid ${actioned[rec.id] ? C.success : C.border}`, background: actioned[rec.id] ? `${C.success}15` : 'white', color: actioned[rec.id] ? C.success : C.muted, fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {actioned[rec.id] ? '✓ Tratado' : 'Tratar'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Micro-pergunta qualitativa (§10) */}
          <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', textAlign: 'center' }}>
            {survey ? (
              <p style={{ fontSize: 13, color: C.success, fontWeight: 700 }}>Obrigado pelo retorno! 🙌</p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: C.ink, marginBottom: 10, fontWeight: 600 }}>Esse briefing te ajudou a priorizar o dia?</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button onClick={() => answerSurvey('yes')} style={{ padding: '7px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, fontSize: 18, cursor: 'pointer' }}>👍</button>
                  <button onClick={() => answerSurvey('no')} style={{ padding: '7px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, fontSize: 18, cursor: 'pointer' }}>👎</button>
                </div>
              </>
            )}
          </div>

          <button onClick={onClose} style={{ padding: '14px 0', borderRadius: 12, background: accent, color: 'white', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginTop: 2 }}>
            Começar o dia →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ ID Operacional (H2) ------------------------------ */
// Identidade operacional do colaborador, derivada das completions.
// Foco em EVOLUÇÃO e qualidade/consistência (não quantidade pura — princípio de gamificação).
const weekStartStr = dateStr => {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
};

function currentStreak(daySet) {
  if (daySet.size === 0) return 0;
  let streak = 0;
  const d = new Date();
  if (!daySet.has(todayStr())) d.setDate(d.getDate() - 1); // permite começar de ontem
  for (;;) {
    const s = d.toISOString().slice(0, 10);
    if (daySet.has(s)) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
}

function longestStreak(days) {
  if (days.length === 0) return 0;
  const sorted = [...days].sort();
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round((new Date(`${sorted[i]}T00:00:00`) - new Date(`${sorted[i - 1]}T00:00:00`)) / 86400000);
    if (diff === 1) { cur++; best = Math.max(best, cur); } else if (diff > 1) { cur = 1; }
  }
  return best;
}

function computeOperationalProfile(completions, userId, userName) {
  const mine = (completions || [])
    .filter(c => c.operatorUserId === userId || c.operatorName === userName)
    .sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));

  let totalItems = 0, doneItems = 0, critTotal = 0, critDone = 0, evidences = 0;
  mine.forEach(c => (c.items || []).forEach(i => {
    totalItems++; if (i.done) doneItems++;
    if (i.critical) { critTotal++; if (i.done) critDone++; }
    if (i.hasPhoto) evidences++;
  }));

  const checklists = mine.length;
  const avgRate = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  const criticalRate = critTotal ? Math.round((critDone / critTotal) * 100) : null;

  const days = [...new Set(mine.map(c => c.date))];
  const streak = currentStreak(new Set(days));
  const bestStreak = longestStreak(days);

  // Evolução: taxa de conclusão por semana (últimas 6 semanas com atividade).
  const wkMap = new Map();
  mine.forEach(c => {
    const wk = weekStartStr(c.date);
    if (!wkMap.has(wk)) wkMap.set(wk, { week: wk, total: 0, done: 0, checklists: 0 });
    const s = wkMap.get(wk); s.checklists++;
    (c.items || []).forEach(i => { s.total++; if (i.done) s.done++; });
  });
  const weekly = [...wkMap.values()]
    .map(s => ({ ...s, rate: s.total ? Math.round((s.done / s.total) * 100) : 0 }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-6);

  const perLevel = 15;
  const level = Math.floor(checklists / perLevel) + 1;
  const intoLevel = checklists % perLevel;

  const achievements = [
    { id: 'first', icon: '🌱', title: 'Primeiro passo', desc: 'Concluiu o primeiro checklist', earned: checklists >= 1 },
    { id: 'ten', icon: '💪', title: 'Pegando o ritmo', desc: '10 checklists concluídos', earned: checklists >= 10 },
    { id: 'fifty', icon: '🔥', title: 'Veterano', desc: '50 checklists concluídos', earned: checklists >= 50 },
    { id: 'streak5', icon: '📆', title: 'Constância', desc: '5 dias seguidos em operação', earned: bestStreak >= 5 },
    { id: 'quality', icon: '⭐', title: 'Caprichoso', desc: 'Média de conclusão ≥ 90%', earned: avgRate >= 90 && checklists >= 5 },
    { id: 'critical', icon: '🛡️', title: 'Guardião do crítico', desc: 'Itens críticos ≥ 95% em dia', earned: criticalRate != null && criticalRate >= 95 && checklists >= 5 },
    { id: 'evidence', icon: '📸', title: 'Provas em dia', desc: '20+ evidências enviadas', earned: evidences >= 20 },
    { id: 'perfectweek', icon: '🏆', title: 'Semana perfeita', desc: 'Uma semana inteira a 100%', earned: weekly.some(w => w.rate === 100 && w.checklists >= 3) },
  ];

  return {
    checklists, avgRate, criticalRate, evidences,
    streak, bestStreak, activeDays: days.length,
    level, intoLevel, perLevel, weekly, achievements,
    recent: mine.slice(-8).reverse(),
  };
}

function OperationalIdView({ targetUser, viewer, completions, accent, onRecognize }) {
  const isSelf = !viewer || viewer.id === targetUser.id;
  const p = useMemo(
    () => computeOperationalProfile(completions, targetUser.id, targetUser.name),
    [completions, targetUser.id, targetUser.name],
  );
  const [survey, setSurvey] = useState(null);
  const [recognitions, setRecognitions] = useState([]);

  useEffect(() => {
    if (isSelf) {
      track('operational_id_viewed', { source: 'id', metadata: { level: p.level, checklists: p.checklists, streak: p.streak } });
    } else {
      track('collaborator_profile_viewed', { source: 'equipe', unitId: targetUser.unitId || undefined, metadata: { target_user_id: targetUser.id, level: p.level, checklists: p.checklists } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUser.id]);

  // Reconhecimentos recebidos (fecha o loop do H2/H3). Só na visão do próprio colaborador.
  useEffect(() => {
    if (!isSelf) return;
    let cancel = false;
    fetchRecognitions(targetUser.id).then(list => {
      if (cancel) return;
      setRecognitions(list);
      try {
        const key = `zc_seen_recognitions_${targetUser.id}`;
        const seen = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
        const fresh = list.filter(r => !seen.has(r.id));
        fresh.forEach(r => track('recognition_received', { source: 'id', metadata: { recognition_id: r.id, metric_ref: r.metricRef } }));
        if (fresh.length) localStorage.setItem(key, JSON.stringify(list.map(r => r.id).slice(0, 200)));
      } catch (_) {}
    });
    return () => { cancel = true; };
  }, [isSelf, targetUser.id]);

  const answerSurvey = ans => {
    if (survey) return;
    setSurvey(ans);
    track('survey_answered', { source: 'id', metadata: { question: 'operational_id_motivates', answer: ans } });
  };

  const initial = (targetUser.name || '?').trim().charAt(0).toUpperCase();
  const firstName = (targetUser.name || '').split(' ')[0];
  const earnedCount = p.achievements.filter(a => a.earned).length;
  const maxWeekRate = Math.max(1, ...p.weekly.map(w => w.rate));

  const Metric = ({ value, label, color }) => (
    <div style={{ flex: 1, textAlign: 'center', padding: '10px 4px' }}>
      <p style={{ fontSize: 24, fontWeight: 800, color: color || C.ink, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 10.5, color: C.muted, marginTop: 4, fontWeight: 700 }}>{label}</p>
    </div>
  );

  if (p.checklists === 0) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${C.border}`, padding: '28px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🌱</div>
          <p className="font-display" style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>
            {isSelf ? 'Seu ID Operacional começa aqui' : `${firstName} ainda não tem histórico`}
          </p>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.5, maxWidth: 300, marginInline: 'auto' }}>
            {isSelf
              ? 'Conclua seu primeiro checklist e comece a construir seu histórico, sua sequência e suas conquistas.'
              : 'Quando começar a concluir checklists, os indicadores e a evolução aparecem aqui.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 14px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cabeçalho — identidade + nível */}
      <div style={{ background: accent, color: 'white', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 999, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>{initial}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>{targetUser.name}</p>
            <p style={{ fontSize: 12, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{ROLE_LABELS[targetUser.role] || targetUser.role}</p>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <p style={{ fontSize: 10, opacity: 0.8, fontWeight: 700 }}>NÍVEL</p>
            <p className="font-display" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{p.level}</p>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.85, marginBottom: 4 }}>
            <span>Progresso do nível</span><span>{p.intoLevel}/{p.perLevel} checklists</span>
          </div>
          <div style={{ height: 7, background: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(p.intoLevel / p.perLevel) * 100}%`, background: 'white', borderRadius: 999 }} />
          </div>
        </div>
      </div>

      {/* Reconhecer (visão do líder — H3) */}
      {!isSelf && (
        <button onClick={() => onRecognize && onRecognize(p)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 12, background: accent, color: 'white', border: 'none', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>
          🏅 Reconhecer {firstName}
        </button>
      )}

      {/* Reconhecimentos recebidos (visão do próprio colaborador) */}
      {isSelf && recognitions.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.success}55`, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>🏅 Reconhecimentos recebidos</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recognitions.slice(0, 5).map(r => (
              <div key={r.id} style={{ borderLeft: `3px solid ${C.success}`, paddingLeft: 10 }}>
                {r.metricLabel && <p style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>{r.metricLabel}</p>}
                {r.message && <p style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}>"{r.message}"</p>}
                <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>— {r.fromUserName || 'Liderança'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicadores */}
      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, display: 'flex' }}>
        <Metric value={p.checklists} label="Checklists" />
        <Metric value={`${p.avgRate}%`} label="Conclusão" color={p.avgRate >= 80 ? C.success : p.avgRate >= 50 ? '#C6842A' : C.critical} />
        <Metric value={p.criticalRate != null ? `${p.criticalRate}%` : '—'} label="Críticos" color={p.criticalRate != null && p.criticalRate >= 90 ? C.success : C.ink} />
        <Metric value={`${p.streak}${p.streak ? '🔥' : ''}`} label="Sequência" />
      </div>

      {/* Evolução */}
      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Sua evolução (conclusão por semana)</p>
        {p.weekly.length === 0 ? (
          <p style={{ fontSize: 12, color: C.mutedLight }}>Ainda sem histórico semanal.</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 96 }}>
            {p.weekly.map(w => (
              <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.muted }}>{w.rate}%</span>
                <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${Math.max(6, (w.rate / maxWeekRate) * 64)}px`, background: w.rate >= 80 ? C.success : w.rate >= 50 ? accent : C.critical, borderRadius: '6px 6px 0 0' }} />
                </div>
                <span style={{ fontSize: 9, color: C.mutedLight }}>{w.week.slice(8, 10)}/{w.week.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conquistas */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingInline: 2 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Conquistas</p>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{earnedCount}/{p.achievements.length}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {p.achievements.map(a => (
            <div key={a.id} style={{ background: 'white', borderRadius: 12, border: `1px solid ${a.earned ? `${C.success}55` : C.border}`, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', opacity: a.earned ? 1 : 0.5 }}>
              <span style={{ fontSize: 22, filter: a.earned ? 'none' : 'grayscale(1)' }}>{a.icon}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>{a.title}</p>
                <p style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.3 }}>{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico recente */}
      {p.recent.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Histórico recente</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.recent.map(c => {
              const done = (c.items || []).filter(i => i.done).length;
              const total = (c.items || []).length;
              const rate = total ? Math.round((done / total) * 100) : 0;
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: rate >= 80 ? C.success : rate >= 50 ? '#C6842A' : C.critical, flexShrink: 0 }} />
                  <p style={{ flex: 1, fontSize: 12.5, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncName(c.templateName, 28)}</p>
                  <span style={{ fontSize: 11, color: C.muted }}>{c.date.slice(8, 10)}/{c.date.slice(5, 7)}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: rate >= 80 ? C.success : C.muted, width: 34, textAlign: 'right' }}>{rate}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Micro-pergunta qualitativa (§10) — só na visão do próprio colaborador */}
      {isSelf && (
        <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', textAlign: 'center' }}>
          {survey ? (
            <p style={{ fontSize: 13, color: C.success, fontWeight: 700 }}>Obrigado pelo retorno! 🙌</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: C.ink, marginBottom: 10, fontWeight: 600 }}>Ver sua evolução aqui te motiva?</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => answerSurvey('yes')} style={{ padding: '7px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, fontSize: 18, cursor: 'pointer' }}>👍</button>
                <button onClick={() => answerSurvey('no')} style={{ padding: '7px 20px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, fontSize: 18, cursor: 'pointer' }}>👎</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Equipe + Reconhecimento (H3) ------------------------------ */
// Âncoras de métrica derivadas do perfil — o reconhecimento fica ancorado num dado objetivo.
function buildMetricAnchors(p) {
  const a = [];
  if (p.avgRate >= 90) a.push({ ref: 'conclusao_alta', label: `Alta conclusão (${p.avgRate}%)` });
  if (p.criticalRate != null && p.criticalRate >= 95) a.push({ ref: 'guardiao_critico', label: 'Itens críticos sempre em dia' });
  if (p.bestStreak >= 5) a.push({ ref: 'constancia', label: `Constância (${p.bestStreak} dias seguidos)` });
  if (p.evidences >= 20) a.push({ ref: 'evidencias', label: 'Provas sempre em dia' });
  p.achievements.filter(x => x.earned).forEach(x => a.push({ ref: `ach_${x.id}`, label: x.title }));
  const seen = new Set();
  const out = [];
  for (const x of a) { if (!seen.has(x.ref)) { seen.add(x.ref); out.push(x); } }
  return out.slice(0, 6);
}

function RecognizeModal({ target, profile, currentUser, unitId, companyId, accent, onClose, onSent }) {
  const anchors = buildMetricAnchors(profile);
  const [metricRef, setMetricRef] = useState(anchors[0]?.ref ?? '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const firstName = (target.name || '').split(' ')[0];

  const send = async () => {
    setSending(true);
    const anchor = anchors.find(a => a.ref === metricRef);
    const ok = await sendRecognition({
      companyId, fromUserId: currentUser.id, fromUserName: currentUser.name,
      toUserId: target.id, toUserName: target.name, unitId,
      metricRef: metricRef || null, metricLabel: anchor?.label || null, message: message.trim() || null,
    });
    track('recognition_sent', { source: 'equipe', unitId: unitId || undefined, metadata: { to_user_id: target.id, has_metric: !!metricRef, metric_ref: metricRef || null } });
    setSending(false);
    onSent(ok);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(6,60,92,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: C.bg, borderRadius: '20px 20px 0 0', padding: 18, paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p className="font-display" style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>🏅 Reconhecer {firstName}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <p style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Ancorar numa métrica</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {anchors.map(a => (
            <button key={a.ref} onClick={() => setMetricRef(a.ref)}
              style={{ textAlign: 'left', padding: '11px 12px', borderRadius: 10, border: `1.5px solid ${metricRef === a.ref ? accent : C.border}`, background: metricRef === a.ref ? `${accent}12` : 'white', color: C.ink, fontSize: 13, fontWeight: metricRef === a.ref ? 800 : 600, cursor: 'pointer' }}>
              {metricRef === a.ref ? '● ' : '○ '}{a.label}
            </button>
          ))}
          <button onClick={() => setMetricRef('')}
            style={{ textAlign: 'left', padding: '11px 12px', borderRadius: 10, border: `1.5px solid ${metricRef === '' ? accent : C.border}`, background: metricRef === '' ? `${accent}12` : 'white', color: C.muted, fontSize: 13, fontWeight: metricRef === '' ? 800 : 600, cursor: 'pointer' }}>
            {metricRef === '' ? '● ' : '○ '}Reconhecimento livre (sem métrica)
          </button>
        </div>

        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Mensagem (opcional)"
          rows={3} style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, resize: 'none', marginBottom: 14, background: 'white', color: C.ink }} />

        <button onClick={send} disabled={sending}
          style={{ width: '100%', padding: '14px 0', borderRadius: 12, background: accent, color: 'white', border: 'none', fontWeight: 800, fontSize: 15, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1 }}>
          {sending ? 'Enviando…' : 'Enviar reconhecimento'}
        </button>
      </div>
    </div>
  );
}

function EquipeView({ currentUser, users, completions, accent, canSeeAllUnits }) {
  const [selected, setSelected] = useState(null);
  const [recognizeFor, setRecognizeFor] = useState(null);
  const [toast, setToast] = useState('');

  const team = useMemo(() => {
    const list = (users || []).filter(u => u.role === 'colaborador' && !u.suspended);
    const scoped = canSeeAllUnits ? list : list.filter(u => u.unitId === currentUser.unitId);
    return scoped
      .map(u => ({ user: u, profile: computeOperationalProfile(completions, u.id, u.name) }))
      .sort((a, b) => b.profile.checklists - a.profile.checklists);
  }, [users, completions, currentUser, canSeeAllUnits]);

  // Perfil do colaborador selecionado (visão do líder)
  if (selected) {
    return (
      <div>
        <BackBar onBack={() => setSelected(null)} label="Voltar para a equipe" accent={accent} />
        <OperationalIdView
          targetUser={selected} viewer={currentUser} completions={completions} accent={accent}
          onRecognize={profile => setRecognizeFor({ user: selected, profile })}
        />
        {recognizeFor && (
          <RecognizeModal
            target={recognizeFor.user} profile={recognizeFor.profile}
            currentUser={currentUser} unitId={selected.unitId} companyId={currentUser.companyId} accent={accent}
            onClose={() => setRecognizeFor(null)}
            onSent={ok => { setRecognizeFor(null); setToast(ok ? 'Reconhecimento enviado 🏅' : 'Não foi possível enviar agora.'); setTimeout(() => setToast(''), 2500); }}
          />
        )}
        {toast && (
          <div style={{ position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom,0px))', left: 16, right: 16, zIndex: 220, background: C.ink, color: 'white', borderRadius: 12, padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{toast}</div>
        )}
      </div>
    );
  }

  // Lista da equipe
  return (
    <div style={{ padding: '14px 14px 28px' }}>
      <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Sua equipe · reconheça pelo desempenho
      </p>
      {team.length === 0 ? (
        <EmptyState title="Nenhum colaborador" desc="Não há colaboradores ativos no seu escopo." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {team.map(({ user, profile }) => (
            <button key={user.id} onClick={() => { setSelected(user); }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 40, height: 40, borderRadius: 999, background: `${accent}18`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
                {(user.name || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
                <p style={{ fontSize: 11.5, color: C.muted }}>
                  {profile.checklists} checklists · {profile.avgRate}% conclusão{profile.streak ? ` · ${profile.streak}🔥` : ''}
                </p>
              </div>
              <ChevronRight size={18} color={C.mutedLight} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AppInner() {
  const { isOnline, pendingSync, syncing } = useNetworkStatus();
  const [unitId, setUnitId] = useState('ibr1');
  const [tab, setTab] = useState('executar');
  const [templates, setTemplates] = useState(null);
  const [completions, setCompletions] = useState(null);
  const [users, setUsers] = useState(null);
  const [closures, setClosures] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [generatingTestData, setGeneratingTestData] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [showRequestsPopup, setShowRequestsPopup] = useState(false);
  const [popupMinimized, setPopupMinimized] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [briefingSource, setBriefingSource] = useState('auto');

  // ── Multi-tenant company data ──────────────────────────────────────────────
  const [company, setCompany] = useState(null);
  const [dynamicUnits, setDynamicUnits] = useState([]);
  const [dynamicSectors, setDynamicSectors] = useState([]);
  const [dynamicTypes, setDynamicTypes] = useState([]);

  // Active UNITS — dynamic when loaded from DB, fallback to hardcoded for IBR
  const ACTIVE_UNITS = dynamicUnits.length > 0 ? dynamicUnits : UNITS;

  // Active checklist types — dynamic when loaded, fallback to hardcoded
  const ACTIVE_TYPES = dynamicTypes.length > 0
    ? dynamicTypes.map(t => ({
        key: t.id,
        label: t.name,
        match: tpl => tpl.name.toLowerCase().includes(t.name.toLowerCase()),
      }))
    : CHECKLIST_TYPE_ORDER;

  // ── Daily Briefing (H1) ────────────────────────────────────────────────────
  const briefing = useMemo(() => {
    if (!templates || !completions) return null;
    const activeUnits = dynamicUnits.length > 0 ? dynamicUnits : UNITS;
    const scope = currentUser?.unitId ?? null;
    return buildBriefing(completions, templates, closures || [], activeUnits, scope);
  }, [templates, completions, closures, dynamicUnits, currentUser?.unitId]);

  // Abre automaticamente 1×/dia para papéis de gestão (o sinal de hábito do H1).
  useEffect(() => {
    if (!currentUser || !MANAGER_ROLES.includes(currentUser.role)) return;
    if (!templates || !completions) return;
    try {
      const key = `zc_briefing_seen_${currentUser.id}_${todayStr()}`;
      if (!localStorage.getItem(key)) { setBriefingSource('auto'); setShowBriefing(true); }
    } catch (_) {}
  }, [currentUser?.id, templates, completions]);

  const closeBriefing = () => {
    try { if (currentUser) localStorage.setItem(`zc_briefing_seen_${currentUser.id}_${todayStr()}`, '1'); } catch (_) {}
    setShowBriefing(false);
  };
  const openBriefing = () => { setBriefingSource('manual'); setShowBriefing(true); };

  // Check for pending requests when gestao logs in
  useEffect(() => {
    if (currentUser?.role !== 'gestao') return;
    const check = async () => {
      try {
        const { supabase } = await import('../../lib/supabase');
        const { count } = await supabase
          .from('user_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pendente');
        if (count > 0) {
          setPendingRequestsCount(count);
          setShowRequestsPopup(true);
          setPopupMinimized(false);
        }
      } catch(e) { console.warn('Pending check failed:', e); }
    };
    // Small delay to let the app settle after login
    const t = setTimeout(check, 1500);
    return () => clearTimeout(t);
  }, [currentUser?.id]);

  // Check push permission status on mount and re-register if needed
  useEffect(() => {
    hasPushPermission().then(async (granted) => {
      setPushEnabled(granted);
      // If permission already granted but we have a logged-in user,
      // re-register subscription in case the DB table was just created
      if (granted && currentUser) {
        try {
          const { supabase } = await import('../../lib/supabase');
          const { count } = await supabase
            .from('push_subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);
          if (count === 0) {
            console.log('[Push] Re-registering subscription...');
            await requestPushPermission(currentUser);
          }
        } catch (e) { console.warn('[Push] Re-register check failed:', e); }
      }
    });
  }, [currentUser?.id]);

  const enablePush = async () => {
    if (!currentUser) return;
    const sub = await requestPushPermission(currentUser);
    setPushEnabled(!!sub);
  };

  const disablePush = async () => {
    if (!currentUser) return;
    try {
      const { supabase } = await import('../../lib/supabase');
      // Unsubscribe no browser
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
        } catch(e) { console.warn('[Push] Browser unsubscribe failed:', e); }
      }
      // Tenta RPC primeiro
      const { error: rpcError } = await supabase.rpc('delete_push_subscription', { p_user_id: currentUser.id });
      if (rpcError) {
        console.warn('[Push] RPC failed, trying direct delete:', rpcError);
        // Fallback: delete direto
        const { error: delError } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', currentUser.id);
        if (delError) console.warn('[Push] Direct delete also failed:', delError);
        else console.log('[Push] Direct delete OK');
      } else {
        console.log('[Push] RPC delete OK');
      }
    } catch(e) { console.warn('[Push] disablePush error:', e); }
    setPushEnabled(false);
  };

  useEffect(() => {
    const TEMPLATES_VERSION = 'v5-stable-ids';

    const loadTemplates = async () => {
      // Check version to reset stale local cache
      let storedVersion = null;
      try { const r = await storageGet('ibr_templates_version'); storedVersion = r.value; } catch {}
      const tpl = await fetchTemplates(SEED_TEMPLATES);
      if (storedVersion !== TEMPLATES_VERSION) {
        // Seed fresh templates to Supabase and reset completions
        await dbSaveTemplates(SEED_TEMPLATES);
        try { await storageSet('ibr_templates_version', TEMPLATES_VERSION); } catch {}
        try { await storageSet('ibr_completions', JSON.stringify([])); } catch {}
        return SEED_TEMPLATES;
      }
      return tpl;
    };

    const tenantSlug = getTenantSlug();
    console.log('[App] tenant slug:', tenantSlug, '| hostname:', typeof window !== 'undefined' ? window.location.hostname : 'SSR');

    Promise.all([
      loadTemplates(),
      fetchCompletions(),
      fetchUsers(SEED_USERS),
      fetchClosures(),
      tenantSlug ? fetchCompany(tenantSlug) : Promise.resolve(null),
      tenantSlug ? fetchUnits(tenantSlug) : Promise.resolve([]),
      tenantSlug ? fetchSectors(tenantSlug) : Promise.resolve([]),
      tenantSlug ? fetchChecklistTypes(tenantSlug) : Promise.resolve([]),
    ]).then(async ([tpl, comp, usr, cls, co, units, sectors, types]) => {
      setTemplates(tpl);
      setCompletions(comp);
      setUsers(usr);
      setClosures(cls);
      if (co) setCompany(co);
      if (units?.length) {
        setDynamicUnits(units.map(u => ({
          id: u.id, name: u.name, color: u.color,
          sectors: (sectors || []).filter(s => s.unit_id === u.id).map(s => s.name),
        })));
      }
      if (sectors?.length) setDynamicSectors(sectors);
      if (types?.length) setDynamicTypes(types);
      await seedSupabaseIfEmpty(tpl, usr);
    }).catch(e => console.error('[App] Startup error:', e));

    // Real-time: listen for new completions from other devices
    const unsubscribe = subscribeToCompletions(null, record => {
      setCompletions(prev => {
        if (!prev) return [record];
        if (prev.some(c => c.id === record.id)) return prev;
        return [...prev, record].slice(-500);
      });
    });

    // Real-time: listen for template changes from Gerenciar (other devices)
    const unsubscribeTemplates = subscribeToTemplates(updated => {
      setTemplates(updated);
    });

    return () => { unsubscribe(); unsubscribeTemplates(); };
  }, []);

  // ── Data persistence — all writes go to Supabase via sync layer ──────────────

  const saveTemplates = async (next, changedIds = null) => {
    setTemplates([...next]);
    try {
      await dbSaveTemplates(next, changedIds);
    } catch (e) { console.error('saveTemplates', e); }
  };

  const saveCompletion = async record => {
    // Optimistic local update first
    setCompletions(prev => [...(prev || []), record].slice(-500));
    // Then push to Supabase (queued offline if needed)
    try { await syncSaveCompletion(record); } catch (e) { console.error('saveCompletion', e); }

    // Instrumentação: 1 evento de checklist + 1 por tarefa concluída.
    try {
      const items = Array.isArray(record.items) ? record.items : [];
      const done = items.filter(i => i.done).length;
      const total = items.length;
      track('checklist_completed', {
        source: 'checklist',
        checklistId: record.templateId,
        userId: record.operatorUserId,
        unitId: record.unitId,
        metadata: {
          template_name: record.templateName,
          sector: record.sector,
          shift: record.shift,
          date: record.date,
          done, total,
          rate: total ? Math.round((done / total) * 100) : 0,
          critical_missed: items.filter(i => i.critical && !i.done).length,
        },
      });
      for (const it of items) {
        if (!it.done) continue;
        track('task_completed', {
          source: 'checklist',
          checklistId: record.templateId,
          taskId: it.id,
          userId: record.operatorUserId,
          unitId: record.unitId,
          metadata: { critical: !!it.critical, has_photo: !!it.photo },
        });
      }
    } catch (e) { console.warn('[track] completion instrumentation failed (ignored)', e); }
  };

  const saveCompletionsBulk = async nextCompletions => {
    const capped = nextCompletions.slice(-500);
    setCompletions(capped);
    // Push each to Supabase
    for (const r of capped) {
      try { await syncSaveCompletion(r); } catch {}
    }
  };

  const saveUsers = async next => {
    setUsers(next);
    try { await dbSaveUsers(next); } catch (e) { console.error('saveUsers', e); }
  };

  const saveClosures = async next => {
    setClosures(next);
    try { await dbSaveClosures(next); } catch (e) { console.error('saveClosures', e); }
  };

  const [testDataResult, setTestDataResult] = useState(null); // { ok: boolean, message: string } | null

  const generateTestData = async (days = 7) => {
    setGeneratingTestData(true);
    setTestDataResult(null);
    try {
      const existingNames = new Set(users.map(u => u.name));
      const newUsers = SEED_USERS.filter(u => ['u5', 'u9', 'u13'].includes(u.id) && !existingNames.has(u.name));
      const nextUsers = newUsers.length ? [...users, ...newUsers] : users;
      if (newUsers.length) await dbSaveUsers(nextUsers);

      const simulated = generateSimulatedCompletions(templates, nextUsers, days);
      const nextCompletions = [...completions, ...simulated];
      const payload = JSON.stringify(nextCompletions);
      console.log('Gravando', simulated.length, 'checklists simulados,', payload.length, 'bytes no total.');
      await saveCompletionsBulk(nextCompletions);

      setTestDataResult({
        ok: true,
        message: `${simulated.length} checklists simulados gerados${newUsers.length ? ` e ${newUsers.length} usuários de teste criados` : ''}.`,
      });
    } catch (e) {
      console.error(e);
      const detail = e && e.message ? e.message : String(e);
      setTestDataResult({ ok: false, message: `Não foi possível gerar os dados de teste. Detalhe: ${detail}` });
    } finally {
      setGeneratingTestData(false);
    }
  };


  if (templates === null || completions === null || users === null) return <LoadingScreen />;

  const offlineBanner = !isOnline ? (
    <div className="flex items-center justify-center gap-2 px-4 py-2" style={{ background: C.critical, color: 'white', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
      <WifiOff size={14} />
      <span style={{ fontSize: 12, fontWeight: 800 }}>Sem conexão — dados salvos localmente</span>
    </div>
  ) : null;

  if (!currentUser) {
    return (
      <>
        {offlineBanner}
        <div style={{ paddingTop: !isOnline ? 40 : 0 }}>
          <LoginScreen
        company={company}
        users={users}
        onLogin={u => {
          setCurrentUser(u);
          setUnitId(u.unitId || 'ibr1');
          setTab(ROLE_TABS[u.role][0]);

          // Instrumentação: abre a sessão de tracking e registra o login.
          setTrackSession(u);
          track('login', { source: 'login', metadata: { role: u.role } });

          // Load company data for this user
          if (u.companyId || u.company_id) {
            const cid = u.companyId || u.company_id;
            Promise.all([
              fetchCompany(null, cid),
              fetchUnits(cid),
              fetchSectors(cid),
              fetchChecklistTypes(cid),
            ]).then(([co, units, sectors, types]) => {
              if (co) setCompany(co);
              if (units.length) {
                setDynamicUnits(units.map(u => ({
                  id: u.id, name: u.name, color: u.color,
                  sectors: sectors.filter(s => s.unit_id === u.id).map(s => s.name),
                })));
              }
              setDynamicSectors(sectors);
              setDynamicTypes(types);
            });
          }
          // Check first access — show welcome screen for colaborador and lideranca
          if (u.role === 'colaborador' || u.role === 'lideranca') {
            const key = `ibr_welcomed_${u.id}`;
            try {
              const already = localStorage.getItem(key);
              if (!already) {
                setShowWelcome(true);
                localStorage.setItem(key, '1');
              }
            } catch(_) {}
          }
          // Request push permission directly — OS shows its own native prompt
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            setTimeout(() => requestPushPermission(u).then(sub => setPushEnabled(!!sub)), 1000);
          }
          // Track presence
          import('../../lib/supabase').then(({ supabase }) => {
            const ch = supabase.channel('presence:users', { config: { presence: { key: u.id } } });
            ch.subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                await ch.track({ user_id: u.id, online_at: new Date().toISOString() });
              }
            });
          }).catch(() => {});
        }}
          />
        </div>
      </>
    );
  }

  const allowedTabs = ROLE_TABS[currentUser.role];
  const canSwitchUnit = currentUser.unitId == null;
  const activeTab = allowedTabs.includes(tab) ? tab : allowedTabs[0];
  const unit = UNITS.find(u => u.id === unitId) || UNITS[0];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .font-display { font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 800; }
        .font-mono-ibr { font-family: ui-monospace, 'SF Mono', 'Roboto Mono', monospace; }
        * { box-sizing: border-box; }
        input, textarea, button { font-family: inherit; }
      `}</style>

      <Header
        unit={unit} onSelectUnit={setUnitId}
        currentUser={currentUser} canSwitchUnit={canSwitchUnit}
        onLogout={() => { clearTrackSession(); setCurrentUser(null); }}
        isOnline={isOnline} syncing={syncing} pendingSync={pendingSync}
        pushEnabled={pushEnabled} onEnablePush={enablePush} onDisablePush={disablePush}
        company={company}
      />

      {/* Tela de boas-vindas — primeiro acesso */}
      {showWelcome && (
        <WelcomeScreen role={currentUser.role} onClose={() => setShowWelcome(false)} />
      )}

      {/* Daily Briefing (H1) — primeira tela do dia para gestão */}
      {showBriefing && !showWelcome && briefing && (
        <DailyBriefing
          briefing={briefing}
          currentUser={currentUser}
          accent={unit.color}
          openSource={briefingSource}
          onClose={closeBriefing}
          onNavigate={(targetUnitId, targetTab) => {
            if (targetUnitId && canSwitchUnit) setUnitId(targetUnitId);
            if (targetTab && allowedTabs.includes(targetTab)) setTab(targetTab);
            closeBriefing();
          }}
        />
      )}
      {showRequestsPopup && currentUser?.role === 'gestao' && !popupMinimized && (
        <div style={{
          position: 'fixed', bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
          left: 12, right: 12, zIndex: 100,
          background: '#063C5C', borderRadius: 14, padding: '14px 16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>🔔</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: 'white', marginBottom: 3 }}>
              {pendingRequestsCount === 1
                ? '1 solicitação pendente'
                : `${pendingRequestsCount} solicitações pendentes`}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 10, lineHeight: 1.4 }}>
              {pendingRequestsCount === 1
                ? 'Há uma nova solicitação aguardando sua aprovação.'
                : `Há ${pendingRequestsCount} solicitações aguardando aprovação.`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setTab('usuarios'); setShowRequestsPopup(false); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: 'white', color: '#063C5C', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
              >
                Ver agora
              </button>
              <button
                onClick={() => setPopupMinimized(true)}
                style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                Minimizar
              </button>
              <button
                onClick={() => setShowRequestsPopup(false)}
                style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', fontWeight: 700, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Badge minimizado */}
      {showRequestsPopup && currentUser?.role === 'gestao' && popupMinimized && (
        <button
          onClick={() => setPopupMinimized(false)}
          style={{
            position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
            right: 16, zIndex: 100,
            background: '#063C5C', color: 'white',
            border: 'none', borderRadius: 999, padding: '8px 14px',
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          🔔 <span style={{ background: '#F5A623', borderRadius: 999, padding: '1px 6px', fontSize: 11 }}>{pendingRequestsCount}</span>
        </button>
      )}



      <main style={{ flex: 1 }} key={unitId}>
        {MANAGER_ROLES.includes(currentUser.role) && !showBriefing && (
          <div style={{ padding: '10px 14px 0' }}>
            <button onClick={openBriefing}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'white', color: C.ink, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              ☀️ Ver briefing do dia
            </button>
          </div>
        )}
        {activeTab === 'executar' && (
          <ExecutarView key={unitId} unit={unit} templates={templates} completions={completions} closures={closures} currentUser={currentUser} onSaveCompletion={saveCompletion} />
        )}
        {activeTab === 'painel' && <PainelView unit={unit} templates={templates} completions={completions} closures={closures} canSeeAllUnits={canSwitchUnit} currentUser={currentUser} users={users} />}
        {activeTab === 'id' && <OperationalIdView targetUser={currentUser} viewer={currentUser} completions={completions || []} accent={unit.color} />}
        {activeTab === 'equipe' && <EquipeView currentUser={currentUser} users={users || []} completions={completions || []} accent={unit.color} canSeeAllUnits={canSwitchUnit} />}
        {activeTab === 'relatorios' && (
          <ReportsView unit={unit} templates={templates} completions={completions} closures={closures} users={users} canSeeAllUnits={canSwitchUnit} />
        )}
        {activeTab === 'gerenciar' && (
          <GerenciarView key={unitId} unit={unit} templates={templates} onSaveTemplates={saveTemplates}
            closures={closures} onSaveClosures={saveClosures} canSeeAllUnits={canSwitchUnit}
            checklistTypes={dynamicTypes} allUnits={ACTIVE_UNITS} company={company}
            onSaveUnit={async u => { await import('../../lib/sync').then(m => m.saveUnit(u)); setDynamicUnits(prev => { const exists = prev.find(x => x.id === u.id); return exists ? prev.map(x => x.id === u.id ? { ...x, ...u } : x) : [...prev, { ...u, sectors: [] }]; }); }}
            onSaveSector={async s => { await import('../../lib/sync').then(m => m.saveSector(s)); setDynamicSectors(prev => [...prev.filter(x => x.id !== s.id), s]); setDynamicUnits(prev => prev.map(u => u.id === s.unitId ? { ...u, sectors: [...(u.sectors || []).filter(x => x !== s.name), s.name] } : u)); }}
            onSaveChecklistType={async t => { await import('../../lib/sync').then(m => m.saveChecklistType(t)); setDynamicTypes(prev => [...prev.filter(x => x.id !== t.id), t]); }}
          />
        )}
        {activeTab === 'usuarios' && (
          <UsersView users={users} onSaveUsers={saveUsers} currentUser={currentUser} onGenerateTestData={generateTestData} generatingTestData={generatingTestData} testDataResult={testDataResult} />
        )}
      </main>

      <BottomNav tab={activeTab} setTab={setTab} accent={unit.color} allowedTabs={allowedTabs} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

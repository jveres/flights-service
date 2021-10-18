FROM ubuntu:20.04
RUN apt-get update && apt-get -y install binutils
RUN apt-get -y install apt-transport-https software-properties-common
RUN echo deb https://fanout.jfrog.io/artifactory/debian fanout-focal main | tee /etc/apt/sources.list.d/fanout.list
RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys EA01C1E777F95324
RUN apt-get update
RUN apt-get -y install pushpin

COPY ./flights-x86_64-unknown-linux-gnu /usr/bin/flights
COPY ./flights.db /usr/bin
COPY ./pushpin.conf /etc/pushpin
COPY ./internal.conf /usr/lib/pushpin

RUN mkdir -p /rootfs
RUN ldd /usr/bin/flights /usr/bin/pushpin /usr/bin/condure /usr/bin/pushpin-proxy /usr/bin/pushpin-handler /usr/bin/m2adapter /usr/bin/zurl \
    /lib/x86_64-linux-gnu/libnss_files.so.* \
    /lib/x86_64-linux-gnu/libnss_dns.so.* \
    | grep -o -e '\/\(usr\|lib\)[^ :]\+' \
    | sort -u | tee /rootfs.list

RUN echo '* localhost:8080' > /etc/pushpin/routes
RUN echo /usr/bin/flights.db >> /rootfs.list
RUN echo /etc/pushpin/routes >> /rootfs.list
RUN echo /etc/pushpin/pushpin.conf >> /rootfs.list
RUN echo /usr/lib/pushpin/internal.conf >> /rootfs.list
RUN echo /usr/lib/pushpin/runner/zurl.conf.template >> /rootfs.list
RUN echo 'hosts: files dns' > /etc/nsswitch.conf
RUN echo /etc/nsswitch.conf >> /rootfs.list
RUN cat /rootfs.list | tar -T- -cphf- | tar -C /rootfs -xpf-

FROM scratch
COPY --from=0 /rootfs/ /
EXPOSE 7999
WORKDIR /usr/bin
ENV PUSHPIN_BIN=/usr/bin/pushpin
CMD ["/usr/bin/flights"]
